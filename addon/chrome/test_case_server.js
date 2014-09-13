(function() {
	var Cc = Components.classes;
	var Ci = Components.interfaces;

	function getPrefBranch(prefName) {
		var prefService = Cc["@mozilla.org/preferences-service;1"]
			.getService(Ci.nsIPrefService);
		return prefService.getBranch(prefName);
	}

	function createServerSocket(listener) {
		var serverSocket = Cc["@mozilla.org/network/server-socket;1"].
			createInstance(Ci.nsIServerSocket);
		var prefBranch = getPrefBranch("mozilla_test.network.");
		//if the port preference is set, we use the preference, or 8888
		var port = prefBranch.getIntPref("port") || 8888 ;
		serverSocket.init(port, true, -1);
		serverSocket.asyncListen(listener);
	}
	
	var inputStreamCallback = {
		onInputStreamReady: function(stream) {
			var sin = Cc["@mozilla.org/scriptableinputstream;1"]
				.createInstance(Ci.nsIScriptableInputStream);
			sin.init(stream);
			var request = '';
			while(sin.available()) {
				request += sin.read(512);
			}
			console.log('Received: ' + request);
			inputStreamAsyncWait(input);
		}
	};
	
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
}());