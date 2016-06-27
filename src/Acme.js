import fs from 'fs';
import crypto from 'crypto';
import {execSync} from 'child_process';
import Request from './Request.js'

const CA = 'https://acme-v01.api.letsencrypt.org';

export default class Acme {
  constructor() {
    this.accountKey = undefined;
    this.nonce = undefined;
  }

  base64SafeEncode(data) {
    let encoded = new Buffer(data).toString('base64');
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async getInitialNonce() {
    let response = await Request.get(CA + '/directory');
    return response.headers['replay-nonce'];
  }

  async signedRequest(key, url, payload) {
    /* Request for getting the initial nonce, subsequent requests will use the nonce from the previous request */
    if (this.nonce === undefined)
      this.nonce = await this.getInitialNonce();

    let jwsHeader = {
      "alg": "RS256",
      "jwk": {
        "e": this.base64SafeEncode(new Buffer(key.publicExponent, 'hex')),
        "kty": "RSA",
        "n": this.base64SafeEncode(new Buffer(key.modulus.replace(/:/g,''), 'hex'))
      },
    };

    let protectedHeader = Object.assign({ nonce: this.nonce }, jwsHeader);
    let protectedHeaderBase64 = this.base64SafeEncode(JSON.stringify(protectedHeader, null, 0));

    let payloadBase64 = this.base64SafeEncode(JSON.stringify(payload, null, 0));

    let sign = crypto.createSign('RSA-SHA256');
    sign.write(protectedHeaderBase64 + "." + payloadBase64);
    sign.end();
    let signature = sign.sign(key.key);
    let signatureBase64 = this.base64SafeEncode(signature);

    let data = {
      "header": jwsHeader,
      "protected": protectedHeaderBase64,
      "payload": payloadBase64,
      "signature": signatureBase64
    };

    let response = await Request.postJson(url, data);

    // Update nonce for next request
    this.nonce = response.headers['replay-nonce'];
    return response;
  }

  /* Generates a private key and returns it as a string in PEM format */
  generatePrivateKey() {
    let result = execSync('openssl genrsa 2048', { stdio : 'pipe' });
    return result.toString();
  }

  generateCSR(key, domain) {
    // TODO: Remove trip
    return execSync('openssl req -new -sha256 -key /dev/stdin -subj "/CN="' + domain + ' -outform DER', { input: key.trim()} );
  }

  convertDERtoPEM(der) {
    return execSync('openssl x509 -in /dev/stdin -inform DER -outform PEM ', { input: der });
  }

  convertPEMtoDER(pem) {
    return execSync('openssl x509 -in /dev/stdin -inform PEM -outform DER ', { input: pem });
  }

  initalizeKey(key) {
    let rawKey = execSync('openssl rsa -noout -text', { input: key }).toString();

    // Fetch the public_exponent and modulus from the output
    let re = /modulus:\n\s+00:([a-f0-9\:\s]+?)\npublicExponent: ([0-9]+)/;
    let reResult = rawKey.match(re);
    let keyModulus = reResult[1].replace(/\s/g,''); // remove all whitespaces
    let keyPublicExponent = Number(reResult[2]).toString(16);
    if (!(keyPublicExponent.lenght % 2)) {
      keyPublicExponent = "0" + keyPublicExponent
    }

    let thumbprintData = {
      "e": this.base64SafeEncode(new Buffer(keyPublicExponent, 'hex')),
      "kty":"RSA",
      "n": this.base64SafeEncode(new Buffer(keyModulus.replace(/:/g,''), 'hex'))
    };

    let thumbprint = this.base64SafeEncode(crypto.createHash('sha256').update(JSON.stringify(thumbprintData, null, 0)).digest());

    this.accountKey = {
      key: key,
      modulus: keyModulus,
      publicExponent: keyPublicExponent,
      thumbprint: thumbprint
    };
  }

  async registerAccountKey(email) {
    let url = CA + "/acme/new-reg";

    let payload = {
      'resource': "new-reg",
      'contact': [
        'mailto:' + email
      ]
    };

    return await this.signedRequest(this.accountKey, url, payload);
  }

  async getRegistration(url) {
    let payload = {
      "resource": "reg"
    };

    return this.signedRequest(this.accountKey, url, payload)
  }

  async hasNewAgreement(url) {
    let registration = await this.getRegistration(url);
    let latestAgreement = registration.headers.link.match(/.*<(.*)>;rel="terms-of-service".*/)[1];
    let acceptedAgreement = JSON.parse(registration.body.toString()).agreement;
    if (latestAgreement != acceptedAgreement) {
      return latestAgreement;
    }
    return false;
  }

  async updateRegistration(url, agreement) {
    let payload = {
      "resource": "reg",
      "agreement": agreement
    };

    return this.signedRequest(this.accountKey, url, payload)
  }

  async newAuthorization(domain) {
    let url = CA + "/acme/new-authz";

    let payload = {
      "resource": "new-authz",
      "identifier": {
        "type": "dns",
        "value": domain
      }
    };

    return this.signedRequest(this.accountKey, url, payload)
  }

  newCertificate(csr) {
    var url = CA + "/acme/new-cert";

    var payload = {
      "resource": "new-cert",
      "csr": this.base64SafeEncode(csr)
    };

    return this.signedRequest(this.accountKey, url, payload)
  }

  revokeCert(certificate) {
    let url = CA + "/acme/revoke-cert";

    let payload = {
      "resource": "revoke-cert",
      "certificate": this.base64SafeEncode(certificate)
    }

    return this.signedRequest(this.accountKey, url, payload);
  }

  extractDnsChallenge(response) {
    for (var challenge of JSON.parse(response).challenges) {
      if (challenge.type == "dns-01") {
        return challenge;
      }
    }
    return undefined;
  }

  async newTxtCallenge(domain) {
    // TODO test for valid response /try catch
    let authResponse = await this.newAuthorization(domain);
    let txtChallenge = this.extractDnsChallenge(authResponse.body);
    let keyAuth = txtChallenge.token + '.' + this.accountKey.thumbprint;
    let hashedKeyAuth = this.base64SafeEncode(crypto.createHash('sha256').update(keyAuth).digest());
    return { hashedKeyAuth: hashedKeyAuth, keyAuth: keyAuth, uri: txtChallenge.uri };
  }

  async validateChallenge(challenge) {
    var payload = {
      "resource": "challenge",
      "keyAuthorization": challenge.keyAuth
    };

    return this.signedRequest(this.accountKey, challenge.uri, payload);
  }

}
