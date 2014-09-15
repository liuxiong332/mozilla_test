
(function (window) {
	window.moveTo(0, 0);
	var screen = window.screen;
	window.resizeTo( screen.availWidth, screen.availHeight);
}(window));


(function() {
	var Cc = Components.classes;
	var Ci = Components.interfaces;
	var Cu = Components.utils;
	var Cr = Components.results;

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

	var strConverter = {};
	strConverter.converter = (function() {
		var uConverter = Cc['@mozilla.org/intl/scriptableunicodeconverter']
    	.getService(Ci.nsIScriptableUnicodeConverter);
    uConverter.charset = 'utf-8';
    return uConverter;
  }());
	strConverter.convertFromByteArray = function(byteArray) {
		return this.converter.convertFromByteArray(byteArray, byteArray.length);
	};
	strConverter.convertToByteArray = function(str) {
		return this.converter.convertToByteArray(str);
	};
	/*analyze the receive data, and get the package
	  the format of data package is started by "mozilla_test" UTF8 string,
	  then 4 bytes of byte number which is the rest of bytes. */
	function DataPackageAnalyzer(listener) {
		this._analyzeState = DataPackageAnalyzer.STATE_NEED_HEADER;
		this._dataSize = 0;
		this._listener = listener;
	}
	DataPackageAnalyzer.STATE_NEED_HEADER = 0;
	DataPackageAnalyzer.STATE_NEED_DATA = 1;

	DataPackageAnalyzer.prototype = {
		analyzeHeader: function(binaryInStream) {
			var packageHeader = "mozilla_test";
			var headerBytes = packageHeader.length + 4;
			if(binaryInStream.available() > headerBytes) {
				var headerArray = binaryInStream.readByteArray(packageHeader.length);
				var headerStr = strConverter.convertFromByteArray(headerArray);
				if(headerStr !== packageHeader)
					throw new Error("header isnot correct");
				//read the byte number

				this._dataSize = binaryInStream.read32();
				this._analyzeState = DataPackageAnalyzer.STATE_NEED_DATA;
				return true;
			}
			return false;
		},
		analyzeData: function(binaryInStream) {
			if(binaryInStream.available() >= this._dataSize) {
				var byteArray = binaryInStream.readByteArray(this._dataSize);
				var str = strConverter.convertFromByteArray(byteArray);
				var obj = JSON.parse(str);
				this._listener.onDataReady(obj);
				this._analyzeState = DataPackageAnalyzer.STATE_NEED_HEADER;
				return true;
			}
			return false;
		},
		onInputStreamReady: function(stream) {
			var res = true;
			var binaryInStream = Cc['@mozilla.org/binaryinputstream;1']
				.createInstance(Ci.nsIBinaryInputStream);
			binaryInStream.setInputStream(stream);
			/*if end-of-file is reached, automitically close() will invoke,
			  when the stream is closed, then available() will throw
			  NS_BASE_STREAM_CLOSED exception
			 */
			try {
				while(binaryInStream.available()>0 && res) {
					switch(this._analyzeState) {
						case DataPackageAnalyzer.STATE_NEED_HEADER: {
							res = this.analyzeHeader(binaryInStream);
							break;
						}
						case DataPackageAnalyzer.STATE_NEED_DATA: {
							res = this.analyzeData(binaryInStream);
							break;
						}
					}
				}
				binaryInStream.close();
				stream.close();
			} catch(e) {
				if(!(typeof e === 'object' && e.result === Cr.NS_BASE_STREAM_CLOSED))
					throw e;
			}
		},
	};


	var binaryStream = {
		getInputStream: function(stream) {
			var binaryInStream = Cc['@mozilla.org/binaryinputstream;1']
				.createInstance(Ci.nsIBinaryInputStream);
			binaryInStream.setInputStream(stream);
			return binaryInStream;
		},
		getOutputStream: function(stream) {
			var binaryOutStream = Cc['@mozilla.org/binaryoutputstream;1']
				.createInstance(Ci.nsIBinaryOutputStream);
			binaryOutStream.setOutputStream(stream);
			return binaryOutStream;
		}
	};

	function ServerSocketListener(inputCallback) {
		function getMainThread() {
			return Cc['@mozilla.org/thread-manager;1'].getService().mainThread;
		}
		this._input = null;		//nsIInputStream

		this._output = null;	//nsIOutputStream

		this._inputStreamCallback = inputCallback;
		this._mainThread = getMainThread();
		this._transport = null;
	}
	ServerSocketListener.prototype = {
		onSocketAccepted: function(serverSocket, transport) {
			this._transport = transport;
			this._input = transport.openInputStream(0, 0, 0).QueryInterface(
				Ci.nsIAsyncInputStream);
			this._output = transport.openOutputStream(0, 0, 0).QueryInterface(
				Ci.nsIAsyncOutputStream);

			this.inputStreamAsyncWait();
		},

		inputStreamAsyncWait: function() {
			this._input.asyncWait(this._inputStreamCallback, 0, 0, this._mainThread);
		},

		getOutputStream: function() {
			return this._output;
		},
		getInputStream: function() {
			return this._input;
		}
	};

	var global = (function() { return this; }());
	global.ServerSocket = ServerSocket;
	global.DataPackageAnalyzer = DataPackageAnalyzer;
	global.strConverter = strConverter;
}());
