
(function (window) {
	window.moveTo(0, 0);
	var screen = window.screen;
	window.resizeTo( screen.availWidth, screen.availHeight);	
}(window));


(function() {
	var Cc = Components.classes;
	var Ci = Components.interfaces;
	var Cu = Components.utils;

	Cu.import("resource:///modules/NetUtil.jsm");

	function getPrefBranch(prefName) {
		var prefService = Cc["@mozilla.org/preferences-service;1"]
			.getService(Ci.nsIPrefService);
		return prefService.getBranch(prefName);
	}

	function ServerSocket(listener) {
		this._listener = listener;
		this._port = 8888;
		this._serverSocket = null;
	}
	ServerSocket.prototype = {
		create: function() {
			var serverSocket = Cc["@mozilla.org/network/server-socket;1"].
				createInstance(Ci.nsIServerSocket);
			var prefBranch = getPrefBranch("mozilla_test.network.");
			//if the port preference is set, we use the preference, or 8888
			if( prefBranch.prefHasUserValue('port') )
				this._port = prefBranch.getIntPref('port');
			serverSocket.init(this._port, true, -1);
			serverSocket.asyncListen(this._listener);
		},
		close: function() {
			this._serverSocket.close();
		},
		getPort: function() {
			return this._port;
		}
	};

	// (function() {
	// 	var serverSocketListener = {
	// 		onSocketAccepted: function(serverSocket, transport) {
	// 			console.log("client connected");
	// 		}
	// 	};
	// 	var serverSocket = new ServerSocket(serverSocketListener);
	// 	serverSocket.create();
	// }());
	
	(function() {
		var createNewLocalSocket = function(port) {
			var socketTransportService = 
			Components.classes["@mozilla.org/network/socket-transport-service;1"]
		    	.getService(Components.interfaces.nsISocketTransportService);
		    return socketTransportService.createTransport(null, 0,
		    	 'localhost', port, null);
		};
		var socket = createNewLocalSocket(8888);
		var poolOutputStream = socket.openOutputStream(0, 0, 0);

		var helloMessage = "Hello World";
    	poolOutputStream.write(helloMessage, helloMessage.length);
    	poolOutputStream.close();
	}());
	
	//analyze the receive data, and get the package
	// the format of data package is started by "mozilla_test" UTF8 string, 
	// then 4 bytes of byte number which is the rest of bytes.
	function DataPackageAnalyzer(listener) {
		this._analyzeState = DataPackageAnalyzer.STATE_NEED_HEADER;
		this._dataSize = 0;
		this._listener = listener;
	}
	DataPackageAnalyzer.STATE_NEED_HEADER = 0;
	DataPackageAnalyzer.STATE_NEED_DATA = 1;

	DataPackageAnalyzer.prototype = {
		analyzeHeader: function(stream) {
			var packageHeader = "mozilla_test";
			var headerBytes = packageHeader.length + 4;
			if(stream.available() > headerBytes) {
				var headerStr = NetUtil.readInputStreamToString(stream, 
					packageHeader.length, { charset: 'utf8' } );
				if(headerStr !== packageHeader)
					throw new Error("header isnot correct");
				//read the byte number
				var binaryInput = Cc["@mozilla.org/binaryinputstream;1"].
					createInstance(Ci.nsIBinaryInputStream);
				binaryInput.setInputStream(stream);
				this._dataSize = binaryInput.read32();
				binaryInput.close();
				this._analyzeState = DataPackageAnalyzer.STATE_NEED_DATA;
				return true;
			}
			return false;
		},
		analyzeData: function(stream) {
			if(stream.available() >= this._dataSize) {
				var str = NetUtil.readInputStreamToString(stream,
					this._dataSize, { charset: 'utf8' } );
				var obj = JSON.parse(str);
				this._listener.onDataReady(obj);
				this._analyzeState = DataPackageAnalyzer.STATE_NEED_HEADER;
				return true;
			}
			return false;
		},
		onInputStreamReady: function(stream) {
			var res = true;
			while(stream.available()>0 && res) {
				switch(this._dataSize) {
					case DataPackageAnalyzer.STATE_NEED_HEADER: {
						res = this.analyzeHeader(stream);
						break;
					}
					case DataPackageAnalyzer.STATE_NEED_DATA: {
						res = this.analyzeData(stream);
						break;
					}
				}
			}
			inputStreamAsyncWait(input);
		},
	};
	
	var inputStreamCallback = new DataPackageAnalyzer();
	function inputStreamAsyncWait(inputStream) {
		var tm = Cc['@mozilla.org/thread-manager;1'].getService();
		//the input stream wait on the main thread
		inputStream.asyncWait(inputStreamCallback, 0, 0, tm.mainThread);
	}

	var serverSocketListener = {
		onSocketAccepted: function(serverSocket, transport) {
			var input = transport.openInputStream(0, 0, 0).QueryInterface(
				Ci.nsIAsyncInputStream);
			var output = transport.openOutputStream(0, 0, 0).QueryInterface(
				Ci.nsIAsyncOutputStream);
			inputStreamAsyncWait(input);
		}
	};

	var global = (function() { return this; }());
	global.ServerSocket = ServerSocket;
}());