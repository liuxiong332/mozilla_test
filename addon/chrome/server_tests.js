QUnit.module("test_server");

QUnit.createNewLocalSocket = function(port) {
	var socketTransportService =
	Components.classes["@mozilla.org/network/socket-transport-service;1"]
    	.getService(Components.interfaces.nsISocketTransportService);
    return socketTransportService.createTransport(null, 0,
    	 '127.0.0.1', port, null);
};

QUnit.createClientAndServer = function(listener) {
	var serverSocket = new QUnit.ServerSocket(function() {
		return listener;
	});
	serverSocket.create();
	var port = listener.port = serverSocket.getPort();
	var clientSocket = listener.clientSocket =
		QUnit.createNewLocalSocket(port);
	return clientSocket;
};

QUnit.initClientandServerReady = function(inputListener, outputListener) {
	var mainThread = QUnit.Cc['@mozilla.org/thread-manager;1']
		.getService().mainThread;

	//asynchronize read string the server
	function inputStringFromSocket(transport) {
		var inputStream = transport.openInputStream(0, 0, 0)
			.QueryInterface(QUnit.Ci.nsIAsyncInputStream);
		inputStream.asyncWait(inputListener, 0, 0, mainThread);
	}
	//when server accept the client connect
	var serverSocketListener = {
		port: 0,
		clientSocket: null,
		onSocketAccepted: function(server, transport) {
			inputStringFromSocket(transport);
			var self = this;
			inputListener.finalize = function() {
				server.close();
				transport.close(0);
				self.clientSocket.close(0);
				QUnit.start();
			}
		}
	};

	var clientSocket = QUnit.createClientAndServer(serverSocketListener);
	//write hello to server, in order to connect to the server
	var poolOutputStream = clientSocket.openOutputStream(0, 0, 0)
		.QueryInterface(QUnit.Ci.nsIAsyncOutputStream);
	poolOutputStream.asyncWait(outputListener, 0, 0, mainThread);
};

QUnit.Cc = Components.classes;
QUnit.Ci = Components.interfaces;

QUnit.asyncTest('createServerSocket is successful', function(assert) {
	var serverSocketListener = {
		port: 0,
		clientSocket: null,
		onSocketAccepted: function(server, transport) {
			assert.strictEqual(server.port, this.port);
			server.close();
			transport.close(0);
			this.clientSocket.close(0);
			QUnit.start();
		}
	};
	var clientSocket = QUnit.createClientAndServer(serverSocketListener);
	//write hello to server, in order to connect to the server
	var poolOutputStream = clientSocket.openOutputStream(0, 0, 0);
	var helloMessage = "Hello";
	poolOutputStream.write(helloMessage, helloMessage.length);
	poolOutputStream.close();
});


QUnit.asyncTest('utf8 read and write', function(assert) {
	var str = "Hello World";

	//when the read is available, we read string from the server buffer
	var inputReadyListener = {
		finalize: null,
		onInputStreamReady: function(inStream) {
			var converterInStream = QUnit.Cc['@mozilla.org/intl/converter-input-stream;1']
			.createInstance(QUnit.Ci.nsIConverterInputStream);
			converterInStream.init(inStream,'utf-8', str.length, 0);
			var resStr = {};
			var length = converterInStream.readString(str.length, resStr);
			assert.strictEqual(str.substr(0, length), resStr.value);
			converterInStream.close();
			inStream.close();

			this.finalize();
		}
	}

	//when client buffer is ready, then we write string to client buffer
	//write string from client to server
	var outputReadyListener = {
		onOutputStreamReady: function(outStream) {
			var converterOutputStream =
			QUnit.Cc["@mozilla.org/intl/converter-output-stream;1"]
            	.createInstance(QUnit.Ci.nsIConverterOutputStream);
      converterOutputStream.init(outStream, 'utf-8', str.length, 0);
      converterOutputStream.writeString(str);
      converterOutputStream.close();
      outStream.close();
		}
	};
	QUnit.initClientandServerReady(inputReadyListener, outputReadyListener);
});

QUnit.asyncTest("dataPackageAnalyzer test", function(assert) {
	var objList = [ { obj: 'hello' }, { obj: 'world' } ];

	function writePackageData(obj, binaryOutStream) {
		var headerBytes= QUnit.strConverter.convertToByteArray('mozilla_test');
		binaryOutStream.writeByteArray(headerBytes, headerBytes.length);

		var bodyBytes = QUnit.strConverter.convertToByteArray(JSON.stringify(obj));
		binaryOutStream.write32(bodyBytes.length);
		binaryOutStream.writeByteArray(bodyBytes, bodyBytes.length);
	}

	var dataListener = {
		index: 0,
		onDataReady: function(obj) {
			assert.ok(this.index<objList.length);
			assert.deepEqual(objList[this.index], obj);
			++this.index;
		}
	}
	var inputListener = {
		finalize: null,
		onInputStreamReady: function(inStream) {
			var analyzer = new QUnit.DataPackageAnalyzer(null, dataListener);
			analyzer.onInputStreamReady(inStream);
			this.finalize();
		}
	};

	var outputListener = {
		onOutputStreamReady: function(outStream) {
			var binaryOutStream = QUnit.Cc['@mozilla.org/binaryoutputstream;1']
				.createInstance(QUnit.Ci.nsIBinaryOutputStream);
			binaryOutStream.setOutputStream(outStream);
			var length = objList.length;
			for(var i = 0; i < length; ++i) {
				writePackageData(objList[i], binaryOutStream);
			}
			binaryOutStream.close();
			outStream.close();
		}
	}
	QUnit.initClientandServerReady(inputListener, outputListener);
});
// QUnit.test('test JSRun', function(assert) {
// 	expect(0);
// 	QUnit.ActionRunner.runJSFile('chrome://mozilla_test/content/js_res.js');
// });

QUnit.asyncTest('run server test', function(assert) {
	var serverSocket = QUnit.runServer();

	serverSocket.onAcceptedHook = function(socket) {
		socket.setCloseListener(function() {
			clientClose();
		});
	};
	var clientSockets = [];
	var openSocketNum = 0;

	var oldRunJSFile = QUnit.ActionRunner.runJSFile;
	//forbid test program to run the fake js file
	QUnit.ActionRunner.runJSFile = function() {};

	function clientClose() {
		if(--openSocketNum > 0)
			return ;
		for(var i = 0; i < clientSockets.length; ++i)
			clientSockets[i].close(0);
		serverSocket.close();
		//restore the origin runJSFile function
		QUnit.ActionRunner.runJSFile = oldRunJSFile;
		QUnit.start();
	}

	for(var i = 0; i < 3; ++i) {
		clientSockets.push(createOneClient());
		++ openSocketNum;
	}

	var actionList = [
		{action: 'addTest', args: {
			//fake files path just for test
			files: ['c:\\js_res.js']
		}}
	];

	function createOneClient() {
		var clientSocket = QUnit.createNewLocalSocket(8888);
		var outStream = clientSocket.openOutputStream(0, 0, 0).QueryInterface(
					QUnit.Ci.nsIAsyncOutputStream);
		var inStream = clientSocket.openInputStream(0, 0, 0).QueryInterface(
					QUnit.Ci.nsIAsyncInputStream);

		var actionResponse = {action: 'addTest', status: 'ok'};
		var index = 0;

		var inStreamCallback = {
			onInputStreamReady: function(stream) {
				var analyzer = new QUnit.DataPackageAnalyzer(null, this);
				analyzer.onInputStreamReady(stream);
			},
			onDataReady: function(obj) {
				assert.deepEqual(actionResponse, obj);
			}
		};

		var outStreamCallback = {
			onOutputStreamReady: function(outStream) {
				function writeActions() {
					for(var i = 0; i < actionList.length; ++i) {
						QUnit.ActionResponse.writeResponse(outStream, actionList[i]);
					}
				}
				for(var i = 0; i < 2; ++i)
					writeActions();
				outStream.close();
			}
		};
		var mainThread = QUnit.ServerSocketListener.mainThread;
		inStream.asyncWait(inStreamCallback, 0, 0, mainThread);
		outStream.asyncWait(outStreamCallback, 0, 0, mainThread);
		return clientSocket;
	}

});

// QUnit.test('run local file', function(assert) {
// 	expect(0);
// 	var filePath = 'E:\\workspace\\mozilla_test\\addon\\chrome\\js_res.js';
// 	var args = {files: [filePath] };
// 	QUnit.ActionRunner.actionList.addTest(args);
// 	// var fileURI = QUnit.ActionRunner.filePathToURI(filePath);
// 	// QUnit.ActionRunner.runJSFile(fileURI);
// 	// var filePath = 'chrome://mozilla_test/content/js_res.js';
// 	// QUnit.ActionRunner.runJSFile(filePath);
// });
