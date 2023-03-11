var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
require('dotenv').config();
var fs = require('fs');
var sio = require('socket.io');
var mediasoup = require('mediasoup');
var https = require('https');
var http = require('http');
var serverOptions = {
    listenPort: process.env.PORT || 80
};
var server = process.env.NODE_ENV === 'development'
    ? https
        .createServer({
        key: fs
            .readFileSync('/etc/letsencrypt/live/azure.howardchung.net/privkey.pem')
            .toString(),
        cert: fs
            .readFileSync('/etc/letsencrypt/live/azure.howardchung.net/fullchain.pem')
            .toString()
    })
        .listen(serverOptions.listenPort)
    : http.createServer().listen(serverOptions.listenPort);
var mediasoupOptions = {
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
        ]
    },
    // Router settings
    router: {
        mediaCodecs: [
            {
                kind: 'audio',
                mimeType: 'audio/opus',
                clockRate: 48000,
                channels: 2
            },
            {
                kind: 'video',
                mimeType: 'video/VP8',
                clockRate: 90000,
                parameters: {
                    'x-google-start-bitrate': 1000
                }
            },
        ]
    },
    // WebRtcTransport settings
    webRtcTransport: {
        listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.EXTERNAL_IP }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        maxIncomingBitrate: 2000000,
        initialAvailableOutgoingBitrate: 1000000
    }
};
// --- socket.io server ---
var io = sio(server);
console.log('socket.io server start. port=' + serverOptions.listenPort);
var rooms = new Map();
var worker = null;
start();
function start() {
    return __awaiter(this, void 0, void 0, function () {
        var namespaces;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, mediasoup.createWorker()];
                case 1:
                    worker = _a.sent();
                    console.log('-- mediasoup worker start. --');
                    namespaces = io.of(/^\/.*/);
                    namespaces.on('connection', function (socket) { return __awaiter(_this, void 0, void 0, function () {
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
                            var id = getId(socket);
                            var consumer = room.getVideoConsumer(id);
                            if (consumer) {
                                consumer.close();
                                room.removeVideoConsumer(id);
                            }
                            var transport = room.getConsumerTrasnport(id);
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
                        var room, _a;
                        var _this = this;
                        var _b;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    if (!((_b = rooms.get(socket.nsp.name)) !== null && _b !== void 0)) return [3 /*break*/, 1];
                                    _a = _b;
                                    return [3 /*break*/, 3];
                                case 1: return [4 /*yield*/, Room.build(worker)];
                                case 2:
                                    _a = _c.sent();
                                    _c.label = 3;
                                case 3:
                                    room = _a;
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
                                    socket.on('connect_error', function (err) {
                                        console.error('client connection error', err);
                                    });
                                    socket.on('getRouterRtpCapabilities', function (data, callback) {
                                        if (room.router) {
                                            console.log('getRouterRtpCapabilities: ', room.router.rtpCapabilities);
                                            sendResponse(room.router.rtpCapabilities, callback);
                                        }
                                        else {
                                            sendReject({ text: 'ERROR- router NOT READY' }, callback);
                                        }
                                    });
                                    // --- producer ----
                                    socket.on('createProducerTransport', function (data, callback) { return __awaiter(_this, void 0, void 0, function () {
                                        var _a, transport, params;
                                        var _b;
                                        return __generator(this, function (_c) {
                                            switch (_c.label) {
                                                case 0:
                                                    console.log('-- createProducerTransport ---');
                                                    room.producerSocketId = getId(socket);
                                                    return [4 /*yield*/, room.createTransport()];
                                                case 1:
                                                    _a = _c.sent(), transport = _a.transport, params = _a.params;
                                                    room.producerTransport = transport;
                                                    (_b = room.producerTransport) === null || _b === void 0 ? void 0 : _b.observer.on('close', function () {
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
                                                    return [2 /*return*/];
                                            }
                                        });
                                    }); });
                                    socket.on('connectProducerTransport', function (data, callback) { return __awaiter(_this, void 0, void 0, function () {
                                        var _a;
                                        return __generator(this, function (_b) {
                                            switch (_b.label) {
                                                case 0: return [4 /*yield*/, ((_a = room.producerTransport) === null || _a === void 0 ? void 0 : _a.connect({
                                                        dtlsParameters: data.dtlsParameters
                                                    }))];
                                                case 1:
                                                    _b.sent();
                                                    sendResponse({}, callback);
                                                    return [2 /*return*/];
                                            }
                                        });
                                    }); });
                                    socket.on('produce', function (data, callback) { return __awaiter(_this, void 0, void 0, function () {
                                        var kind, rtpParameters, _a, _b;
                                        var _c;
                                        return __generator(this, function (_d) {
                                            switch (_d.label) {
                                                case 0:
                                                    kind = data.kind, rtpParameters = data.rtpParameters;
                                                    console.log('-- produce --- kind=', kind);
                                                    if (!(kind === 'video')) return [3 /*break*/, 2];
                                                    _a = room;
                                                    return [4 /*yield*/, ((_c = room.producerTransport) === null || _c === void 0 ? void 0 : _c.produce({
                                                            kind: kind,
                                                            rtpParameters: rtpParameters
                                                        }))];
                                                case 1:
                                                    _a.videoProducer = _d.sent();
                                                    room.videoProducer.observer.on('close', function () {
                                                        console.log('videoProducer closed ---');
                                                    });
                                                    sendResponse({ id: room.videoProducer.id }, callback);
                                                    return [3 /*break*/, 5];
                                                case 2:
                                                    if (!(kind === 'audio')) return [3 /*break*/, 4];
                                                    _b = room;
                                                    return [4 /*yield*/, room.producerTransport.produce({
                                                            kind: kind,
                                                            rtpParameters: rtpParameters
                                                        })];
                                                case 3:
                                                    _b.audioProducer = _d.sent();
                                                    room.audioProducer.observer.on('close', function () {
                                                        console.log('audioProducer closed ---');
                                                    });
                                                    sendResponse({ id: room.audioProducer.id }, callback);
                                                    return [3 /*break*/, 5];
                                                case 4:
                                                    console.error('produce ERROR. BAD kind:', kind);
                                                    //sendResponse({}, callback);
                                                    return [2 /*return*/];
                                                case 5:
                                                    // inform clients about new producer
                                                    console.log('--broadcast newProducer -- kind=', kind);
                                                    socket.broadcast.emit('newProducer', { kind: kind });
                                                    return [2 /*return*/];
                                            }
                                        });
                                    }); });
                                    // --- consumer ----
                                    socket.on('createConsumerTransport', function (data, callback) { return __awaiter(_this, void 0, void 0, function () {
                                        var _a, transport, params;
                                        return __generator(this, function (_b) {
                                            switch (_b.label) {
                                                case 0:
                                                    console.log('-- createConsumerTransport ---');
                                                    return [4 /*yield*/, room.createTransport()];
                                                case 1:
                                                    _a = _b.sent(), transport = _a.transport, params = _a.params;
                                                    room.addConsumerTrasport(getId(socket), transport);
                                                    transport.observer.on('close', function () {
                                                        var id = getId(socket);
                                                        console.log('--- consumerTransport closed. --');
                                                        var consumer = room.getVideoConsumer(getId(socket));
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
                                                    return [2 /*return*/];
                                            }
                                        });
                                    }); });
                                    socket.on('connectConsumerTransport', function (data, callback) { return __awaiter(_this, void 0, void 0, function () {
                                        var transport;
                                        return __generator(this, function (_a) {
                                            switch (_a.label) {
                                                case 0:
                                                    console.log('-- connectConsumerTransport ---');
                                                    transport = room.getConsumerTrasnport(getId(socket));
                                                    if (!transport) {
                                                        console.error('transport NOT EXIST for id=' + getId(socket));
                                                        sendResponse({}, callback);
                                                        return [2 /*return*/];
                                                    }
                                                    return [4 /*yield*/, transport.connect({ dtlsParameters: data.dtlsParameters })];
                                                case 1:
                                                    _a.sent();
                                                    sendResponse({}, callback);
                                                    return [2 /*return*/];
                                            }
                                        });
                                    }); });
                                    socket.on('consume', function (data, callback) { return __awaiter(_this, void 0, void 0, function () {
                                        var kind, transport, res, consumer_1, params, id_1, params, transport, res, consumer_2, params, id_2, params;
                                        return __generator(this, function (_a) {
                                            switch (_a.label) {
                                                case 0:
                                                    kind = data.kind;
                                                    console.log('-- consume --kind=' + kind);
                                                    if (!(kind === 'video')) return [3 /*break*/, 4];
                                                    if (!room.videoProducer) return [3 /*break*/, 2];
                                                    transport = room.getConsumerTrasnport(getId(socket));
                                                    if (!transport) {
                                                        console.error('transport NOT EXIST for id=' + getId(socket));
                                                        return [2 /*return*/];
                                                    }
                                                    return [4 /*yield*/, room.createConsumer(transport, room.videoProducer, data.rtpCapabilities)];
                                                case 1:
                                                    res = _a.sent();
                                                    if (res) {
                                                        consumer_1 = res.consumer, params = res.params;
                                                        id_1 = getId(socket);
                                                        room.addVideoConsumer(id_1, consumer_1);
                                                        consumer_1 === null || consumer_1 === void 0 ? void 0 : consumer_1.on('producerclose', function () {
                                                            console.log('consumer -- on.producerclose');
                                                            consumer_1.close();
                                                            room.removeVideoConsumer(id_1);
                                                            // -- notify to client ---
                                                            socket.emit('producerClosed', {
                                                                localId: id_1,
                                                                remoteId: room.producerSocketId,
                                                                kind: 'video'
                                                            });
                                                        });
                                                        console.log('-- consumer ready ---');
                                                        sendResponse(params, callback);
                                                    }
                                                    return [3 /*break*/, 3];
                                                case 2:
                                                    console.log('-- consume, but video producer NOT READY');
                                                    params = {
                                                        producerId: null,
                                                        id: null,
                                                        kind: 'video',
                                                        rtpParameters: {}
                                                    };
                                                    sendResponse(params, callback);
                                                    _a.label = 3;
                                                case 3: return [3 /*break*/, 9];
                                                case 4:
                                                    if (!(kind === 'audio')) return [3 /*break*/, 8];
                                                    if (!room.audioProducer) return [3 /*break*/, 6];
                                                    transport = room.getConsumerTrasnport(getId(socket));
                                                    if (!transport) {
                                                        console.error('transport NOT EXIST for id=' + getId(socket));
                                                        return [2 /*return*/];
                                                    }
                                                    return [4 /*yield*/, room.createConsumer(transport, room.audioProducer, data.rtpCapabilities)];
                                                case 5:
                                                    res = _a.sent();
                                                    if (res) {
                                                        consumer_2 = res.consumer, params = res.params;
                                                        id_2 = getId(socket);
                                                        room.addAudioConsumer(id_2, consumer_2);
                                                        consumer_2 === null || consumer_2 === void 0 ? void 0 : consumer_2.on('producerclose', function () {
                                                            console.log('consumer -- on.producerclose');
                                                            consumer_2.close();
                                                            room.removeAudioConsumer(id_2);
                                                            // -- notify to client ---
                                                            socket.emit('producerClosed', {
                                                                localId: id_2,
                                                                remoteId: room.producerSocketId,
                                                                kind: 'audio'
                                                            });
                                                        });
                                                        console.log('-- consumer ready ---');
                                                        sendResponse(params, callback);
                                                    }
                                                    return [3 /*break*/, 7];
                                                case 6:
                                                    console.log('-- consume, but audio producer NOT READY');
                                                    params = {
                                                        producerId: null,
                                                        id: null,
                                                        kind: 'audio',
                                                        rtpParameters: {}
                                                    };
                                                    sendResponse(params, callback);
                                                    _a.label = 7;
                                                case 7: return [3 /*break*/, 9];
                                                case 8:
                                                    console.error('ERROR: UNKNOWN kind=' + kind);
                                                    _a.label = 9;
                                                case 9: return [2 /*return*/];
                                            }
                                        });
                                    }); });
                                    socket.on('resume', function (data, callback) { return __awaiter(_this, void 0, void 0, function () {
                                        var kind, consumer;
                                        return __generator(this, function (_a) {
                                            switch (_a.label) {
                                                case 0:
                                                    kind = data.kind;
                                                    console.log('-- resume -- kind=' + kind);
                                                    if (!(kind === 'video')) return [3 /*break*/, 2];
                                                    consumer = room.getVideoConsumer(getId(socket));
                                                    if (!consumer) {
                                                        console.error('consumer NOT EXIST for id=' + getId(socket));
                                                        sendResponse({}, callback);
                                                        return [2 /*return*/];
                                                    }
                                                    return [4 /*yield*/, consumer.resume()];
                                                case 1:
                                                    _a.sent();
                                                    sendResponse({}, callback);
                                                    return [3 /*break*/, 3];
                                                case 2:
                                                    console.warn('NO resume for audio');
                                                    _a.label = 3;
                                                case 3: return [2 /*return*/];
                                            }
                                        });
                                    }); });
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                    return [2 /*return*/];
            }
        });
    });
}
var Room = /** @class */ (function () {
    function Room() {
        var _this = this;
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
        this.getConsumerTrasnport = function (id) {
            return _this.transports[id];
        };
        this.addConsumerTrasport = function (id, transport) {
            _this.transports[id] = transport;
            console.log('consumerTransports count=' + Object.keys(_this.transports).length);
        };
        this.removeConsumerTransport = function (id) {
            delete _this.transports[id];
            console.log('consumerTransports count=' + Object.keys(_this.transports).length);
        };
        this.getVideoConsumer = function (id) {
            return _this.videoConsumers[id];
        };
        this.addVideoConsumer = function (id, consumer) {
            _this.videoConsumers[id] = consumer;
            console.log('videoConsumers count=' + Object.keys(_this.videoConsumers).length);
        };
        this.removeVideoConsumer = function (id) {
            delete _this.videoConsumers[id];
            console.log('videoConsumers count=' + Object.keys(_this.videoConsumers).length);
        };
        this.getAudioConsumer = function (id) {
            return _this.audioConsumers[id];
        };
        this.addAudioConsumer = function (id, consumer) {
            _this.audioConsumers[id] = consumer;
            console.log('audioConsumers count=' + Object.keys(_this.audioConsumers).length);
        };
        this.removeAudioConsumer = function (id) {
            delete _this.audioConsumers[id];
            console.log('audioConsumers count=' + Object.keys(_this.audioConsumers).length);
        };
        this.createTransport = function () { return __awaiter(_this, void 0, void 0, function () {
            var transport;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.router.createWebRtcTransport(mediasoupOptions.webRtcTransport)];
                    case 1:
                        transport = _a.sent();
                        console.log('-- create transport id=' + transport.id);
                        console.log(transport.iceCandidates);
                        return [2 /*return*/, {
                                transport: transport,
                                params: {
                                    id: transport.id,
                                    iceParameters: transport.iceParameters,
                                    iceCandidates: transport.iceCandidates,
                                    dtlsParameters: transport.dtlsParameters
                                }
                            }];
                }
            });
        }); };
        this.createConsumer = function (transport, producer, rtpCapabilities) { return __awaiter(_this, void 0, void 0, function () {
            var consumer;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        consumer = null;
                        if (!this.router.canConsume({
                            producerId: producer.id,
                            rtpCapabilities: rtpCapabilities
                        })) {
                            console.error('can not consume');
                            return [2 /*return*/, null];
                        }
                        return [4 /*yield*/, transport
                                .consume({
                                // OK
                                producerId: producer.id,
                                rtpCapabilities: rtpCapabilities,
                                paused: producer.kind === 'video'
                            })["catch"](function (err) {
                                console.error('consume failed', err);
                                return;
                            })];
                    case 1:
                        //consumer = await producerTransport.consume({ // NG: try use same trasport as producer (for loopback)
                        consumer = _a.sent();
                        return [2 /*return*/, {
                                consumer: consumer,
                                params: {
                                    producerId: producer.id,
                                    id: consumer.id,
                                    kind: consumer.kind,
                                    rtpParameters: consumer.rtpParameters,
                                    type: consumer.type,
                                    producerPaused: consumer.producerPaused
                                }
                            }];
                }
            });
        }); };
    }
    Room.build = function (worker) {
        return __awaiter(this, void 0, void 0, function () {
            var room, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        room = new Room();
                        _a = room;
                        return [4 /*yield*/, worker.createRouter({
                                mediaCodecs: mediasoupOptions.router.mediaCodecs
                            })];
                    case 1:
                        _a.router = _b.sent();
                        return [2 /*return*/, room];
                }
            });
        });
    };
    return Room;
}());
