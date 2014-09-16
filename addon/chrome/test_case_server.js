
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

	function log(message) {
		var console = Cc["@mozilla.org/consoleservice;1"]
			.getService(Ci.nsIConsoleService);
		console.logStringMessage(message);
	}

	function getPrefBranch(prefName) {
		var prefService = Cc["@mozilla.org/preferences-service;1"]
			.getService(Ci.nsIPrefService);
		return prefService.getBranch(prefName);
	}

	function ServerSocket(listenerFactory) {
		this._listenerFactory = listenerFactory;
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
			serverSocket.asyncListen(this);
			this._serverSocket = serverSocket;
		},
		close: function() {
			this._serverSocket.close();
		},
		getPort: function() {
			return this._port;
		},
		onAcceptedHook: function(listener) {},
		onSocketAccepted: function(serverSocket, transport) {
			var listener = this._listenerFactory();
			listener.onSocketAccepted(serverSocket, transport);
			this.onAcceptedHook(listener);
		//	serverSocket.asyncListen(this);
		}
	};

	function ServerSocketListener() {
		this._input = null;		//nsIInputStream
		this._output = null;	//nsIOutputStream

		this._inputStreamCallback = null;
		this._transport = null;

		this._closeListener = null;
	}
	ServerSocketListener.getMainThread = function() {
		return Cc['@mozilla.org/thread-manager;1'].getService().mainThread;
	};
	ServerSocketListener.mainThread = ServerSocketListener.getMainThread();
	ServerSocketListener.prototype = {
		processSocket: function() {
			var response = new ActionResponse(this._output);
			var actionRunner = new ActionRunner(this, response);
			var dataAnalyzer = new DataPackageAnalyzer(this, actionRunner);
			this._inputStreamCallback = dataAnalyzer;
		},
		onSocketAccepted: function(serverSocket, transport) {
			this._transport = transport;
			this._openInputStream();
			this._output = transport.openOutputStream(0, 0, 0).QueryInterface(
				Ci.nsIAsyncOutputStream);

			this.processSocket();
			this.inputStreamAsyncWait();
		},

		inputStreamAsyncWait: function() {
			log('ServerSocketListener.inputStreamAsyncWait invoke');
			this._input.asyncWait(this._inputStreamCallback, 0, 0,
				ServerSocketListener.mainThread);
		},
		_openInputStream: function() {
			this._input = this._transport.openInputStream(0, 0, 0).QueryInterface(
				Ci.nsIAsyncInputStream);
		},
		getOutputStream: function() {
			return this._output;
		},
		getInputStream: function() {
			return this._input;
		},
		close: function() {
			this._input.close();
			this._output.close();
			this._transport.close(0);
			if(this._closeListener)
				this._closeListener();
		},
		setCloseListener: function(listener) {
			this._closeListener = listener;
		}
	};

	var strConverter = {
		converter: (function() {
			var uConverter = Cc['@mozilla.org/intl/scriptableunicodeconverter']
	    	.getService(Ci.nsIScriptableUnicodeConverter);
	    uConverter.charset = 'utf-8';
	    return uConverter;
	  }()),
		convertFromByteArray: function(byteArray) {
			return this.converter.convertFromByteArray(byteArray, byteArray.length);
		},
		convertToByteArray: function(str) {
			return this.converter.convertToByteArray(str);
		}
	};
	/*analyze the receive data, and get the package
	  the format of data package is started by "mozilla_test" UTF8 string,
	  then 4 bytes of byte number which is the rest of bytes. */
	function DataPackageAnalyzer(socket, listener) {
		this._socket = socket;
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
			log('DataPackageAnalyzer.analyzeHeader available = ' +
				binaryInStream.available() + ' header = ' + headerBytes);
			if(binaryInStream.available() >= headerBytes) {
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
			log('DataPackageAnalyzer.analyzeHeader available = ' +
				binaryInStream.available() + ' data = ' + this._dataSize);
			if(binaryInStream.available() >= this._dataSize) {
				var byteArray = binaryInStream.readByteArray(this._dataSize);
				var str = strConverter.convertFromByteArray(byteArray);
				var obj = JSON.parse(str);
				log('analyze object: ' + QUnit.dump.parse(obj));
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
				log('onInputStreamReady available() is ' +
					binaryInStream.available() + ' status is ' + this._analyzeState);
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
			} catch(e) {
				//end-of-file
				if(typeof e === 'object' && e.result === Cr.NS_BASE_STREAM_CLOSED) {
					return this._socket && this._socket.close();
				} else
					throw e;
			}
			if(this._socket)
				this._socket.inputStreamAsyncWait();
		}
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

	function ActionRunner(socket, actionListener) {
		this._listener = actionListener;
		this.actionList = {
			// disconnect: function() {
			// 	alert('close');
			// 	socket.close();
			// }
		};
	}
	/*run the specific js file by the file url, the uri can be
	  chrome:, resource: or file: URL */
	ActionRunner.runJSFile = function(fileUrl) {
		var loader = Cc['@mozilla.org/moz/jssubscript-loader;1']
    	.getService(Ci.mozIJSSubScriptLoader);
    loader.loadSubScript(fileUrl);
	};

	ActionRunner.runFiles = function(files) {
		var length = files.length;
		for(var i = 0; i < length; ++i) {
			this.runJSFile(files[i]);
		}
	};

	ActionRunner.actionList = {
		start: function() {
			QUnit.start();
			return true;
		},
		addTest: function(args) {
			var baseDir = args.baseDir;
			var files = args.files;
			if(!(files && Array.isArray(files))) 	return false;
			if(baseDir) {
				if(!/\/$/.test(baseDir))	baseDir += '/';
				var length = files.length;
				for(var i = 0; i < length; ++i)
					files[i] = baseDir + files[i];
			}
			ActionRunner.runFiles(files);
			return true;
		}
	};
	ActionRunner.prototype = {
		runAction: function(obj) {
			log('begin runAction');
			var action = obj.action;
			var res = false;
			if(action) {
				var actionFunc = ActionRunner.actionList[action]
					|| this.actionList[action];
				if( actionFunc && actionFunc(obj.args) )
					res = true;
			}
			log('runAction res: ' + res);
			var listener = this._listener;
			listener && (res? listener.onActionOk(obj): listener.onActionFail(obj));
		},
	 	onDataReady: function(obj) {
			return this.runAction(obj);
		}
	}

	function  ActionResponse(outStream) {
		this._outStream = outStream;
	}
	ActionResponse.writePackageData = function(obj, binaryOutStream) {
		var headerBytes= strConverter.convertToByteArray('mozilla_test');
		binaryOutStream.writeByteArray(headerBytes, headerBytes.length);

		var bodyBytes = strConverter.convertToByteArray(JSON.stringify(obj));
		binaryOutStream.write32(bodyBytes.length);
		binaryOutStream.writeByteArray(bodyBytes, bodyBytes.length);
	};
	ActionResponse.writeResponse = function(outStream, obj) {
		var binaryOutStream = Cc['@mozilla.org/binaryoutputstream;1']
				.createInstance(Ci.nsIBinaryOutputStream);
		binaryOutStream.setOutputStream(outStream);
		ActionResponse.writePackageData(obj, binaryOutStream);
	};
	ActionResponse.prototype = {
		onActionOk: function(obj) {
			var okResponse = {
				action: obj.action,
				status: 'ok'
			};
			log('ActionResponse write ok status to client');
			ActionResponse.writeResponse(this._outStream, okResponse);
			this._outStream.flush();
		},
		onActionFail: function(obj) {
			var failResponse = {
				action: obj.action,
				status: 'fail'
			};
			ActionResponse.writeResponse(this._outStream, failResponse);
			this._outStream.flush();
		}
	};

	function runServer() {
		function socketFactory() {
			return new ServerSocketListener;
		}
		var serverSocket = new ServerSocket(socketFactory);
		serverSocket.create();
		return serverSocket;
	}

	QUnit.ServerSocket = ServerSocket;
	QUnit.ServerSocketListener = ServerSocketListener;
	QUnit.DataPackageAnalyzer = DataPackageAnalyzer;
	QUnit.strConverter = strConverter;
	QUnit.ActionRunner = ActionRunner;
	QUnit.ActionResponse = ActionResponse;
	QUnit.runServer = runServer;

	window.runServer = runServer;
}());
