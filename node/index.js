
var fs = require('fs');
var net = require('net');
var child_process = require('child_process');
var readline = require('readline');
var path = require('path');
var assert = require('assert');

var envConfig = {
  thunderbirdPath: '\"%ProgramFiles(x86)%\\Mozilla' +
    ' Thunderbird\\thunderbird.exe\"',
  thunderbirdPathSpawn: 'C:/Program\ Files\ (x86)/Mozilla' +
  '\ Thunderbird/thunderbird.exe',
  chromeFilePath: 'chrome://mozilla_test/content/index.html'
};

function getAbsoluteFilePath(filePath) {
  var absolutePath = filePath;
  if(!/^\w:/.test(filePath)) {
    var cwd = process.cwd();
    if(!/\\$/.test(cwd))  cwd += '\\';
    absolutePath = cwd + filePath;
  }
  return path.normalize(absolutePath);
}

function getAbsoluteFilePathByDir(dir, filePath) {
  if(/^\w:/.test(filePath)) return filePath;
  var absPath = path.join(dir, filePath);
  path.normalize(absPath);
  console.log(absPath);
  return absPath;
}

function getStartThunderbirdCmd() {
  var startThunderbirdCmd = envConfig.thunderbirdPath + ' -chrome ' +
    envConfig.chromeFilePath + ' -jsconsole';
  console.log(startThunderbirdCmd);
  return startThunderbirdCmd;
}

/*the Args Analyzer is used for analyze the arguments*/
function ArgsAnalyzer() {
  var args = process.argv.slice(2);
  this.filePath = args[0];
  this.noEndThunderbird = args.some(function(arg) {
    return arg === '-noend';
  });
}
ArgsAnalyzer.prototype = {
  getFilePath: function() {
    return this.filePath;
  },
  getNoEndThunderbirdFlag: function() {
    return this.noEndThunderbird;
  }
};
var argsAnalyzer = new ArgsAnalyzer;

function getFilePathFromArgs() {
  var filePath = argsAnalyzer.getFilePath();

  if(!filePath) {
    throw new Error('please specific the file path');
  }
  filePath = getAbsoluteFilePath(filePath);
  console.log('the file path is ' + filePath);
  return filePath;
}

function generateActionBuffer() {

  function generateActionObj() {
    var configPath = getFilePathFromArgs();
    var fileBuffer = fs.readFileSync(configPath);
    var fileListObj = JSON.parse(fileBuffer.toString());
    var fileList = fileListObj.files;

    var configDir = path.dirname(configPath);
    fileList = fileList.map( getAbsoluteFilePathByDir.bind(null, configDir) );
    fileListObj = {files: fileList};
    return { action: 'addTest', args: fileListObj };
  }
  var actionBuffer = new Buffer( JSON.stringify(generateActionObj()) );
  var headerBuffer =  new Buffer('mozilla_test');
  var packageBuffer = new Buffer(actionBuffer.length + 4 + headerBuffer.length);
  headerBuffer.copy(packageBuffer);
  packageBuffer.writeInt32BE(actionBuffer.length, headerBuffer.length);
  actionBuffer.copy(packageBuffer, headerBuffer.length + 4);
  return packageBuffer;
}

function DataParser(callback) {
  this._buffer = null;
  this._dataSize = 0;
  this._callback = callback;
  this._state = DataParser.NEED_HEADER_STATUS;
}
DataParser.NEED_HEADER_STATUS = 0;
DataParser.NEED_BODY_STATUS = 1;
DataParser.headerBuffer = new Buffer('mozilla_test');
DataParser.prototype = {
  parseHeader: function() {
    var buffer = this._buffer;
    var header = DataParser.headerBuffer;
    if(buffer.length >= header.length + 4) {
      this._dataSize = buffer.readInt32BE(header.length);
      this._state = DataParser.NEED_BODY_STATUS;
      this._buffer = buffer.slice(header.length + 4);
      return true;
    }
    return false;
  },
  parseBody: function() {
    var buffer = this._buffer;
    if(buffer.length >= this._dataSize) {
      var obj = JSON.parse(buffer.toString('utf8', 0, this._dataSize));
      this._callback(obj);
      this._buffer = buffer.slice(this._dataSize);
      return true;
    }
    return false;
  },
  onDataReady: function(buffer) {
    var res = true;
    if(this._buffer)
      this._buffer = Buffer.concat([this._buffer, buffer]);
    else
      this._buffer = buffer;
    while(this._buffer.length>0 && res) {
      switch(this._state) {
        case DataParser.NEED_HEADER_STATUS: {
          res = this.parseHeader();
          break;
        }
        case DataParser.NEED_BODY_STATUS: {
          res = this.parseBody();
          break;
        }
      }
    }
  }
};

function startClient() {
  var clientSocket = net.connect({port: 8888}, function() {

    var dataParser = new DataParser(function(obj) {
      console.log('status of action' + obj.action + ' is ' + obj.status);
      clientSocket.end();
    });

    clientSocket.on('data', function(buffer) {
      console.log('get response data');
      dataParser.onDataReady(buffer);
    });

    clientSocket.on('error', function(error) {
      clientSocket.destroy();
      console.log('rise a error ' + error + ', prepare to restart...');
      startClient();
    });

    clientSocket.write(generateActionBuffer());
  });
}

function requestAction() {
  var child = child_process.spawn(envConfig.thunderbirdPathSpawn,
    ['-chrome', envConfig.chromeFilePath, '-jsconsole'], {
    detached: true,
    env: process.env,
    cwd: process.cwd(),
    stdio: ['ignore', 'ignore', 'ignore']
  });
  child.on('error', function(err) {
    console.log(err);
  });
  child.unref();
  startClient();
}


function endThunderbirdRun(callback) {
  var taskListProc = child_process.exec('tasklist',
    function(err, stdout, stderr) {
    var result = /thunderbird\.exe\s+(\d+)/.exec(stdout);
    if(!result) return callback();
    var killCmd = 'taskkill /F /PID ' + result[1];
    child_process.exec(killCmd, function(err, stdout, stderr) {
      callback();
    });
  });
}

if(argsAnalyzer.getNoEndThunderbirdFlag())
  startClient();
else
  endThunderbirdRun(requestAction);

