var https = require('https');
var url = require('url');

export default class Request {

  static get(urlString) {
    let urlObject = url.parse(urlString);
    let options = {
      method: 'GET',
      hostname: urlObject.hostname,
      path: urlObject.pathname
    };

    return new Promise((resolve, reject) => {
      let req = https.request(options, function (response) {

        let responseBody = [];
        response.on('data', function (data) {
            responseBody.push(data);
        });

        response.on('end', function () {
          resolve({
            headers: response.headers,
            body: Buffer.concat(responseBody),
            statusCode: response.statusCode
          });
        });

        response.on('error', function (error) {
           reject(error);
        });

      }).end();
    });
  }

  static postJson(urlString, jsonData) {
    let urlObject = url.parse(urlString);
    let data = JSON.stringify(jsonData);
    let options = {
      method: 'POST',
      hostname: urlObject.hostname,
      path: urlObject.pathname,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    };

    return new Promise((resolve, reject) => {
      let req = https.request(options, function (response) {

        let responseBody = [];
        response.on('data', function (data) {
            responseBody.push(data);
        });

        response.on('end', function () {
          resolve({
            headers: response.headers,
            body: Buffer.concat(responseBody),
            statusCode: response.statusCode
          });
        });

        response.on('error', function (error) {
           reject(error);
        });

      });
      req.write(data);
      req.end();
    });
  }
}

//export default { get };
