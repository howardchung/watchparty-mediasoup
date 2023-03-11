"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
const fs = __importStar(require("fs"));
const socket_io_1 = require("socket.io");
const mediasoup = __importStar(require("mediasoup"));
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const child_process_1 = require("child_process");
let serverOptions = {
    listenPort: process.env.PORT || 80,
};
const key = process.env.SSL_KEY_FILE
    ? fs.readFileSync(process.env.SSL_KEY_FILE).toString()
    : '';
const cert = process.env.SSL_CERT_FILE
    ? fs.readFileSync(process.env.SSL_CERT_FILE).toString()
    : '';
const server = (key && cert)
    ? https
        .createServer({
        key,
        cert,
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
        listenIps: [{ ip: '0.0.0.0', announcedIp: (0, child_process_1.execSync)(`curl https://api.ipify.org`).toString('utf8') }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        maxIncomingBitrate: 2000000,
        initialAvailableOutgoingBitrate: 1000000,
    },
};
// --- socket.io server ---
const io = new socket_io_1.Server(server);
console.log('socket.io server start. port=' + serverOptions.listenPort);
const rooms = new Map();
start();
function start() {
    return __awaiter(this, void 0, void 0, function* () {
        const worker = yield mediasoup.createWorker();
        console.log('-- mediasoup worker start. --');
        const namespaces = io.of(/^\/.*/);
        namespaces.on('connection', (socket) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const room = (_a = rooms.get(socket.nsp.name)) !== null && _a !== void 0 ? _a : (yield Room.build(worker));
            if (!rooms.has(socket.nsp.name)) {
                // Save this room
                rooms.set(socket.nsp.name, room);
            }
            console.log('client connected. socket id=' + getId(socket), 'namespace=' + socket.nsp.name);
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
                }
                else {
                    sendReject({ text: 'ERROR- router NOT READY' }, callback);
                }
            });
            // --- producer ----
            socket.on('createProducerTransport', (data, callback) => __awaiter(this, void 0, void 0, function* () {
                var _b;
                console.log('-- createProducerTransport ---');
                room.producerSocketId = getId(socket);
                const { transport, params } = yield room.createTransport();
                room.producerTransport = transport;
                (_b = room.producerTransport) === null || _b === void 0 ? void 0 : _b.observer.on('close', () => {
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
            }));
            socket.on('connectProducerTransport', (data, callback) => __awaiter(this, void 0, void 0, function* () {
                var _c;
                yield ((_c = room.producerTransport) === null || _c === void 0 ? void 0 : _c.connect({
                    dtlsParameters: data.dtlsParameters,
                }));
                sendResponse({}, callback);
            }));
            socket.on('produce', (data, callback) => __awaiter(this, void 0, void 0, function* () {
                var _d, _e, _f, _g, _h, _j;
                const { kind, rtpParameters } = data;
                console.log('-- produce --- kind=', kind);
                if (kind === 'video') {
                    room.videoProducer = yield ((_d = room.producerTransport) === null || _d === void 0 ? void 0 : _d.produce({
                        kind,
                        rtpParameters,
                    }));
                    (_e = room.videoProducer) === null || _e === void 0 ? void 0 : _e.observer.on('close', () => {
                        console.log('videoProducer closed ---');
                    });
                    sendResponse({ id: (_f = room.videoProducer) === null || _f === void 0 ? void 0 : _f.id }, callback);
                }
                else if (kind === 'audio') {
                    room.audioProducer = yield ((_g = room.producerTransport) === null || _g === void 0 ? void 0 : _g.produce({
                        kind,
                        rtpParameters,
                    }));
                    (_h = room.audioProducer) === null || _h === void 0 ? void 0 : _h.observer.on('close', () => {
                        console.log('audioProducer closed ---');
                    });
                    sendResponse({ id: (_j = room.audioProducer) === null || _j === void 0 ? void 0 : _j.id }, callback);
                }
                else {
                    console.error('produce ERROR. BAD kind:', kind);
                    //sendResponse({}, callback);
                    return;
                }
                // inform clients about new producer
                console.log('--broadcast newProducer -- kind=', kind);
                socket.broadcast.emit('newProducer', { kind: kind });
            }));
            // --- consumer ----
            socket.on('createConsumerTransport', (data, callback) => __awaiter(this, void 0, void 0, function* () {
                console.log('-- createConsumerTransport ---');
                const { transport, params } = yield room.createTransport();
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
            }));
            socket.on('connectConsumerTransport', (data, callback) => __awaiter(this, void 0, void 0, function* () {
                console.log('-- connectConsumerTransport ---');
                let transport = room.getConsumerTrasnport(getId(socket));
                if (!transport) {
                    console.error('transport NOT EXIST for id=' + getId(socket));
                    sendResponse({}, callback);
                    return;
                }
                yield transport.connect({ dtlsParameters: data.dtlsParameters });
                sendResponse({}, callback);
            }));
            socket.on('consume', (data, callback) => __awaiter(this, void 0, void 0, function* () {
                const kind = data.kind;
                console.log('-- consume --kind=' + kind);
                if (kind === 'video') {
                    if (room.videoProducer) {
                        let transport = room.getConsumerTrasnport(getId(socket));
                        if (!transport) {
                            console.error('transport NOT EXIST for id=' + getId(socket));
                            return;
                        }
                        const res = yield room.createConsumer(transport, room.videoProducer, data.rtpCapabilities); // producer must exist before consume
                        if (res) {
                            const { consumer, params } = res;
                            const id = getId(socket);
                            room.addVideoConsumer(id, consumer);
                            consumer === null || consumer === void 0 ? void 0 : consumer.on('producerclose', () => {
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
                    }
                    else {
                        console.log('-- consume, but video producer NOT READY');
                        const params = {
                            producerId: null,
                            id: null,
                            kind: 'video',
                            rtpParameters: {},
                        };
                        sendResponse(params, callback);
                    }
                }
                else if (kind === 'audio') {
                    if (room.audioProducer) {
                        let transport = room.getConsumerTrasnport(getId(socket));
                        if (!transport) {
                            console.error('transport NOT EXIST for id=' + getId(socket));
                            return;
                        }
                        const res = yield room.createConsumer(transport, room.audioProducer, data.rtpCapabilities); // producer must exist before consume
                        if (res) {
                            const { consumer, params } = res;
                            const id = getId(socket);
                            room.addAudioConsumer(id, consumer);
                            consumer === null || consumer === void 0 ? void 0 : consumer.on('producerclose', () => {
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
                    }
                    else {
                        console.log('-- consume, but audio producer NOT READY');
                        const params = {
                            producerId: null,
                            id: null,
                            kind: 'audio',
                            rtpParameters: {},
                        };
                        sendResponse(params, callback);
                    }
                }
                else {
                    console.error('ERROR: UNKNOWN kind=' + kind);
                }
            }));
            socket.on('resume', (data, callback) => __awaiter(this, void 0, void 0, function* () {
                const kind = data.kind;
                console.log('-- resume -- kind=' + kind);
                if (kind === 'video') {
                    let consumer = room.getVideoConsumer(getId(socket));
                    if (!consumer) {
                        console.error('consumer NOT EXIST for id=' + getId(socket));
                        sendResponse({}, callback);
                        return;
                    }
                    yield consumer.resume();
                    sendResponse({}, callback);
                }
                else {
                    console.warn('NO resume for audio');
                }
            }));
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
        }));
    });
}
class Room {
    constructor() {
        // ========= mediasoup state needs to be created per room ===========
        this.router = null;
        this.producerTransport = null;
        this.videoProducer = null;
        this.audioProducer = null;
        this.producerSocketId = null;
        // --- multi-consumers --
        this.transports = {};
        this.videoConsumers = {};
        this.audioConsumers = {};
        this.getConsumerTrasnport = (id) => {
            return this.transports[id];
        };
        this.addConsumerTrasport = (id, transport) => {
            this.transports[id] = transport;
            console.log('consumerTransports count=' + Object.keys(this.transports).length);
        };
        this.removeConsumerTransport = (id) => {
            delete this.transports[id];
            console.log('consumerTransports count=' + Object.keys(this.transports).length);
        };
        this.getVideoConsumer = (id) => {
            return this.videoConsumers[id];
        };
        this.addVideoConsumer = (id, consumer) => {
            this.videoConsumers[id] = consumer;
            console.log('videoConsumers count=' + Object.keys(this.videoConsumers).length);
        };
        this.removeVideoConsumer = (id) => {
            delete this.videoConsumers[id];
            console.log('videoConsumers count=' + Object.keys(this.videoConsumers).length);
        };
        this.getAudioConsumer = (id) => {
            return this.audioConsumers[id];
        };
        this.addAudioConsumer = (id, consumer) => {
            this.audioConsumers[id] = consumer;
            console.log('audioConsumers count=' + Object.keys(this.audioConsumers).length);
        };
        this.removeAudioConsumer = (id) => {
            delete this.audioConsumers[id];
            console.log('audioConsumers count=' + Object.keys(this.audioConsumers).length);
        };
        this.createTransport = () => __awaiter(this, void 0, void 0, function* () {
            const transport = yield this.router.createWebRtcTransport(mediasoupOptions.webRtcTransport);
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
        });
        this.createConsumer = (transport, producer, rtpCapabilities) => __awaiter(this, void 0, void 0, function* () {
            let consumer = null;
            if (!this.router.canConsume({
                producerId: producer.id,
                rtpCapabilities,
            })) {
                console.error('can not consume');
                return null;
            }
            try {
                consumer = yield transport.consume({
                    // OK
                    producerId: producer.id,
                    rtpCapabilities,
                    paused: producer.kind === 'video',
                });
            }
            catch (e) {
                console.warn(e);
            }
            return {
                consumer: consumer,
                params: {
                    producerId: producer.id,
                    id: consumer === null || consumer === void 0 ? void 0 : consumer.id,
                    kind: consumer === null || consumer === void 0 ? void 0 : consumer.kind,
                    rtpParameters: consumer === null || consumer === void 0 ? void 0 : consumer.rtpParameters,
                    type: consumer === null || consumer === void 0 ? void 0 : consumer.type,
                    producerPaused: consumer === null || consumer === void 0 ? void 0 : consumer.producerPaused,
                },
            };
        });
    }
    static build(worker) {
        return __awaiter(this, void 0, void 0, function* () {
            const room = new Room();
            room.router = yield worker.createRouter({
                mediaCodecs: mediasoupOptions.router.mediaCodecs,
            });
            return room;
        });
    }
}
