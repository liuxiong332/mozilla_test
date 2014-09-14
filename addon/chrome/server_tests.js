QUnit.module("test_server");

QUnit.createNewLocalSocket = function(port) {
	var socketTransportService = 
	Components.classes["@mozilla.org/network/socket-transport-service;1"]
    	.getService(Components.interfaces.nsISocketTransportService);
    return socketTransportService.createTransport(null, 0,
    	 '127.0.0.1', port, null);
};

QUnit.createClientAndServer = function(listener) {
	var serverSocket = new ServerSocket(listener);
	serverSocket.create();
	var port = listener.port = serverSocket.getPort();
	var socket = listener.clientSocket = 
		QUnit.createNewLocalSocket(port);

	//write hello to the server
	var poolOutputStream = socket.openOutputStream(0, 0, 0);
	var helloMessage = "Hello";
	poolOutputStream.write(helloMessage, helloMessage.length);
	poolOutputStream.close();
};

QUnit.asyncTest('createServerSocket is successful', function( assert ) {
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
	QUnit.createClientAndServer(serverSocketListener);
});

// QUnit.asyncTest('send and recv data', function( assert ) {
// 	var Ci = Components.interfaces;
// 	var Cc = Components.classes;

// 	var serverSocketListener = {
// 		port: 0,
// 		clientSocket: null,
// 		onSocketAccepted: function(server, transport) {
// 			// var writeStr = "the mozilla test string";
// 			// var output = transport.openOutputStream(Ci.nsITransport.OPEN_BLOCKING,
// 			// 	 0, 0);
// 			// var converterOutStream = Cc['@mozilla.org/intl/converter-output-stream;1']
// 			// 	.createInstance(Ci.nsIConverterOutputStream);
// 			// converterOutStream.init(output, 'utf8', writeStr.length);
// 			// converterOutStream.writeString(writeStr);
// 			// converterOutStream.close();
// 			// output.close();

// 			// var input = clientSocket.openInputStream(Ci.nsITransport.OPEN_BLOCKING,
// 			// 	0, 0);
// 			// var converterInStream = Cc['@mozilla.org/intl/converter-input-stream;1']
// 			// 	.createInstance(Ci.nsIConverterInputStream);
// 			// converterInStream.init(input, 'utf8', input.available());
// 			// out = {};
// 			// converterInStream.readString(input.available(), out);
// 			// converterInStream.close();
// 			// input.close();

// 			// assert.strictEqual(out.value, writeStr);

// 			transport.close();
// 			server.close();
// 			this.clientSocket.close();

// 			QUnit.start();
// 		}
// 	};
// 	QUnit.createClientAndServer(serverSocketListener);
// });