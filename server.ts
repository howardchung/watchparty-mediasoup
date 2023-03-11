require('dotenv').config();
const fs = require('fs');
const sio = require('socket.io');
const mediasoup = require('mediasoup');
const https = require('https');
const http = require('http');

let serverOptions = {
  listenPort: process.env.PORT || 80,
};
const server =
  process.env.NODE_ENV === 'development'
    ? https
        .createServer({
          key: fs
            .readFileSync(
              '/etc/letsencrypt/live/azure.howardchung.net/privkey.pem'
            )
            .toString(),
          cert: fs
            .readFileSync(
              '/etc/letsencrypt/live/azure.howardchung.net/fullchain.pem'
            )
            .toString(),
        })
        .listen(serverOptions.listenPort)
    : http.createServer().listen(serverOptions.listenPort);

const mediasoupOptions = {
  // Worker settings
  worker: {
    rtcMinPort: 10000,
    rtcMaxPort: 10500,
    logLevel: 'warn',
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
      // 'rtx',
      // 'bwe',
      // 'score',
      // 'simulcast',
      // 'svc'
    ],
  },
  // Router settings
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
    ],
  },
  // WebRtcTransport settings
  webRtcTransport: {
    listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.EXTERNAL_IP }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    maxIncomingBitrate: 2000000,
    initialAvailableOutgoingBitrate: 1000000,
  },
};

// --- socket.io server ---
const io = sio(server);
console.log('socket.io server start. port=' + serverOptions.listenPort);

const rooms = new Map<string, Room>();
let worker = null;
start();

async function start() {
  worker = await mediasoup.createWorker();
  console.log('-- mediasoup worker start. --');

  const namespaces = io.of(/^\/.*/);
  namespaces.on('connection', async (socket) => {
    const room = rooms.get(socket.nsp.name) ?? await Room.build(worker);
    if (!rooms.has(socket.nsp.name)) {
      // Save this room
      rooms.set(socket.nsp.name, room);
    }

    console.log(
      'client connected. socket id=' + getId(socket),
      'namespace=' + socket.nsp.name
    );
    socket.on('disconnect', function () {
      // close user connection
      console.log('client disconnected. socket id=' + getId(socket));
      cleanUpPeer(socket);
    });
    socket.on('error', function (err) {
      console.error('socket ERROR:', err);
    });
    socket.on('connect_error', (err) => {
      console.error('client connection error', err);
    });

    socket.on('getRouterRtpCapabilities', (data, callback) => {
      if (room.router) {
        console.log('getRouterRtpCapabilities: ', room.router.rtpCapabilities);
        sendResponse(room.router.rtpCapabilities, callback);
      } else {
        sendReject({ text: 'ERROR- router NOT READY' }, callback);
      }
    });

    // --- producer ----
    socket.on('createProducerTransport', async (data, callback) => {
      console.log('-- createProducerTransport ---');
      room.producerSocketId = getId(socket);
      const { transport, params } = await room.createTransport();
      room.producerTransport = transport;
      room.producerTransport?.observer.on('close', () => {
        if (room.videoProducer) {
          room.videoProducer.close();
          room.videoProducer = null;
        }
        if (room.audioProducer) {
          room.audioProducer.close();
          room.audioProducer = null;
        }
        room.producerTransport = null;
      });
      //console.log('-- createProducerTransport params:', params);
      sendResponse(params, callback);
    });

    socket.on('connectProducerTransport', async (data, callback) => {
      await room.producerTransport?.connect({
        dtlsParameters: data.dtlsParameters,
      });
      sendResponse({}, callback);
    });

    socket.on('produce', async (data, callback) => {
      const { kind, rtpParameters } = data;
      console.log('-- produce --- kind=', kind);
      if (kind === 'video') {
        room.videoProducer = await room.producerTransport?.produce({
          kind,
          rtpParameters,
        });
        room.videoProducer.observer.on('close', () => {
          console.log('videoProducer closed ---');
        });
        sendResponse({ id: room.videoProducer.id }, callback);
      } else if (kind === 'audio') {
        room.audioProducer = await room.producerTransport.produce({
          kind,
          rtpParameters,
        });
        room.audioProducer.observer.on('close', () => {
          console.log('audioProducer closed ---');
        });
        sendResponse({ id: room.audioProducer.id }, callback);
      } else {
        console.error('produce ERROR. BAD kind:', kind);
        //sendResponse({}, callback);
        return;
      }

      // inform clients about new producer
      console.log('--broadcast newProducer -- kind=', kind);
      socket.broadcast.emit('newProducer', { kind: kind });
    });

    // --- consumer ----
    socket.on('createConsumerTransport', async (data, callback) => {
      console.log('-- createConsumerTransport ---');
      const { transport, params } = await room.createTransport();
      room.addConsumerTrasport(getId(socket), transport);
      transport.observer.on('close', () => {
        const id = getId(socket);
        console.log('--- consumerTransport closed. --');
        let consumer = room.getVideoConsumer(getId(socket));
        if (consumer) {
          consumer.close();
          room.removeVideoConsumer(id);
        }
        consumer = room.getAudioConsumer(getId(socket));
        if (consumer) {
          consumer.close();
          room.removeAudioConsumer(id);
        }
        room.removeConsumerTransport(id);
      });
      //console.log('-- createTransport params:', params);
      sendResponse(params, callback);
    });

    socket.on('connectConsumerTransport', async (data, callback) => {
      console.log('-- connectConsumerTransport ---');
      let transport = room.getConsumerTrasnport(getId(socket));
      if (!transport) {
        console.error('transport NOT EXIST for id=' + getId(socket));
        sendResponse({}, callback);
        return;
      }
      await transport.connect({ dtlsParameters: data.dtlsParameters });
      sendResponse({}, callback);
    });

    socket.on('consume', async (data, callback) => {
      const kind = data.kind;
      console.log('-- consume --kind=' + kind);

      if (kind === 'video') {
        if (room.videoProducer) {
          let transport = room.getConsumerTrasnport(getId(socket));
          if (!transport) {
            console.error('transport NOT EXIST for id=' + getId(socket));
            return;
          }
          const res = await room.createConsumer(
            transport,
            room.videoProducer,
            data.rtpCapabilities
          ); // producer must exist before consume
          if (res) {
            const { consumer, params } = res;
            const id = getId(socket);
            room.addVideoConsumer(id, consumer);
            consumer?.on('producerclose', () => {
              console.log('consumer -- on.producerclose');
              consumer.close();
              room.removeVideoConsumer(id);

              // -- notify to client ---
              socket.emit('producerClosed', {
                localId: id,
                remoteId: room.producerSocketId,
                kind: 'video',
              });
            });

            console.log('-- consumer ready ---');
            sendResponse(params, callback);
          }
        } else {
          console.log('-- consume, but video producer NOT READY');
          const params = {
            producerId: null,
            id: null,
            kind: 'video',
            rtpParameters: {},
          };
          sendResponse(params, callback);
        }
      } else if (kind === 'audio') {
        if (room.audioProducer) {
          let transport = room.getConsumerTrasnport(getId(socket));
          if (!transport) {
            console.error('transport NOT EXIST for id=' + getId(socket));
            return;
          }
          const res = await room.createConsumer(
            transport,
            room.audioProducer,
            data.rtpCapabilities
          ); // producer must exist before consume
          if (res) {
            const { consumer, params } = res;
            const id = getId(socket);
            room.addAudioConsumer(id, consumer);
            consumer?.on('producerclose', () => {
              console.log('consumer -- on.producerclose');
              consumer.close();
              room.removeAudioConsumer(id);

              // -- notify to client ---
              socket.emit('producerClosed', {
                localId: id,
                remoteId: room.producerSocketId,
                kind: 'audio',
              });
            });

            console.log('-- consumer ready ---');
            sendResponse(params, callback);
          }
        } else {
          console.log('-- consume, but audio producer NOT READY');
          const params = {
            producerId: null,
            id: null,
            kind: 'audio',
            rtpParameters: {},
          };
          sendResponse(params, callback);
        }
      } else {
        console.error('ERROR: UNKNOWN kind=' + kind);
      }
    });

    socket.on('resume', async (data, callback) => {
      const kind = data.kind;
      console.log('-- resume -- kind=' + kind);
      if (kind === 'video') {
        let consumer = room.getVideoConsumer(getId(socket));
        if (!consumer) {
          console.error('consumer NOT EXIST for id=' + getId(socket));
          sendResponse({}, callback);
          return;
        }
        await consumer.resume();
        sendResponse({}, callback);
      } else {
        console.warn('NO resume for audio');
      }
    });

    // --- send response to client ---
    function sendResponse(response, callback) {
      //console.log('sendResponse() callback:', callback);
      callback(null, response);
    }

    // --- send error to client ---
    function sendReject(error, callback) {
      callback(error.toString(), null);
    }

    function getId(socket) {
      return socket.id;
    }

    function cleanUpPeer(socket) {
      const id = getId(socket);
      const consumer = room.getVideoConsumer(id);
      if (consumer) {
        consumer.close();
        room.removeVideoConsumer(id);
      }

      const transport = room.getConsumerTrasnport(id);
      if (transport) {
        transport.close();
        room.removeConsumerTransport(id);
      }

      if (room.producerSocketId === id) {
        console.log('---- cleanup producer ---');
        if (room.videoProducer) {
          room.videoProducer.close();
          room.videoProducer = null;
        }
        if (room.audioProducer) {
          room.audioProducer.close();
          room.audioProducer = null;
        }

        if (room.producerTransport) {
          room.producerTransport.close();
          room.producerTransport = null;
        }

        room.producerSocketId = null;
      }
    }
  });
}

class Room {
  // ========= mediasoup state needs to be created per room ===========
  public router: any = null;
  public producerTransport: any = null;
  public videoProducer: any = null;
  public audioProducer: any = null;
  public producerSocketId: any = null;

  // --- multi-consumers --
  public transports = {};
  public videoConsumers = {};
  public audioConsumers = {};

  private constructor() {}

  public static async build(worker): Promise<Room> {
    const room = new Room();
    room.router = await worker.createRouter({
      mediaCodecs: mediasoupOptions.router.mediaCodecs,
    });
    return room;
  }

  getConsumerTrasnport = (id) => {
    return this.transports[id];
  };

  addConsumerTrasport = (id, transport) => {
    this.transports[id] = transport;
    console.log(
      'consumerTransports count=' + Object.keys(this.transports).length
    );
  };

  removeConsumerTransport = (id) => {
    delete this.transports[id];
    console.log(
      'consumerTransports count=' + Object.keys(this.transports).length
    );
  };

  getVideoConsumer = (id) => {
    return this.videoConsumers[id];
  };

  addVideoConsumer = (id, consumer) => {
    this.videoConsumers[id] = consumer;
    console.log(
      'videoConsumers count=' + Object.keys(this.videoConsumers).length
    );
  };

  removeVideoConsumer = (id) => {
    delete this.videoConsumers[id];
    console.log(
      'videoConsumers count=' + Object.keys(this.videoConsumers).length
    );
  };

  getAudioConsumer = (id) => {
    return this.audioConsumers[id];
  };

  addAudioConsumer = (id, consumer) => {
    this.audioConsumers[id] = consumer;
    console.log(
      'audioConsumers count=' + Object.keys(this.audioConsumers).length
    );
  };

  removeAudioConsumer = (id) => {
    delete this.audioConsumers[id];
    console.log(
      'audioConsumers count=' + Object.keys(this.audioConsumers).length
    );
  };

  createTransport = async () => {
    const transport = await this.router.createWebRtcTransport(
      mediasoupOptions.webRtcTransport
    );
    console.log('-- create transport id=' + transport.id);
    console.log(transport.iceCandidates);
    return {
      transport: transport,
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    };
  };

  createConsumer = async (transport, producer, rtpCapabilities) => {
    let consumer: any = null;
    if (
      !this.router.canConsume({
        producerId: producer.id,
        rtpCapabilities,
      })
    ) {
      console.error('can not consume');
      return null;
    }

    //consumer = await producerTransport.consume({ // NG: try use same trasport as producer (for loopback)
    consumer = await transport
      .consume({
        // OK
        producerId: producer.id,
        rtpCapabilities,
        paused: producer.kind === 'video',
      })
      .catch((err) => {
        console.error('consume failed', err);
        return;
      });

    return {
      consumer: consumer,
      params: {
        producerId: producer.id,
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
      },
    };
  };
}
