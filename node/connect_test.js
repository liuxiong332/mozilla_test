
var fs = require('fs');
var net = require('net');
var child_process = require('child_process');

var bufferInfo = {};
bufferInfo.getBuffer = function() {
  var action = {
    action: 'addTest',
    args: {
      files: ['chrome://mozilla_test/content/js_res.js']
    }
  };
  var headerBuffer = new Buffer('mozilla_test');
  bufferInfo.headerBuffer = headerBuffer;
  var actionBuffer = new Buffer(JSON.stringify(action));
  var buffer = new Buffer(headerBuffer.length + actionBuffer.length + 4);
  headerBuffer.copy(buffer, 0);
  buffer.writeInt32BE(actionBuffer.length, headerBuffer.length);
  actionBuffer.copy(buffer, headerBuffer.length + 4);
  return buffer;
};

var clientSocket = net.connect({port: 8888}, function() {
  console.log('connect 8888 successfully!');
  var headerBuffer = new Buffer('mozilla_test');
  var buffer = bufferInfo.getBuffer();

  var writeRes = clientSocket.write(buffer);
  console.log('buffer flush status ' + writeRes);

  clientSocket.on('data', function(buffer) {
    var statusBuf = buffer.slice(bufferInfo.headerBuffer.length + 4);
    var obj = JSON.parse(statusBuf.toString());
    console.log('status of action' + obj.action + ' is ' + obj.status);
    clientSocket.end();
  });
});

