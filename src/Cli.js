import fs from 'fs'
import path from 'path'
import Route53 from './Route53.js'
import Config from './Config.js'
import Acme from './Acme.js'

export default class Cli {

  constructor() {
    this.acme = new Acme();
    this.config = new Config();
    this.r53 = new Route53();
  }

  async delay(time) {
    return new Promise(function (fulfill) {
      setTimeout(fulfill, time);
    });
  }

  async waitForRecord(changeId) {
    process.stdout.write(" * Waiting for record to be INSYNC");
    while (true) {
      process.stdout.write(".");
      let isInSync = await this.r53.isRecordIsInsync(changeId);
      if (isInSync) {
        process.stdout.write("done\n");
        break;
      }
      await this.delay(1000);
    }
  }

  mkdirSync(path) {
    try {
      fs.mkdirSync(path);
    } catch(e) {
      // Do nothing if the directory exists
      if ( e.code != 'EEXIST' ) throw e;
    }
  }

  getAccountKey() {
    let accountKeyPath = this.config.getAccountKeyPath();
    try {
      return fs.readFileSync(accountKeyPath).toString();
    } catch (e) {
      return undefined;
    }
  }

  async setup(email) {
    console.log(" * Setting up account");

    let configDirectory = this.config.getConfigDirectory();
    console.log(" * Ensuring directory exists: " + configDirectory);
    this.mkdirSync(this.config.getConfigDirectory()); // Ensure the config directory exists

    // TODO add varning when you change email
    this.config.loadConfigFile();
    if (email !== this.config.getEmail()) {
      console.log(" * Set account email to: " + email);
      this.config.setEmail(email);
    }
    this.config.saveConfigFile();

    let accountKey = this.getAccountKey();
    if (accountKey) {
      console.log(" * Account key already generated, skipping");
    } else {
      console.log(" * No account key found, generating a new key");
      accountKey = this.acme.generatePrivateKey();
      let accountKeyPath = this.config.getAccountKeyPath();
      fs.writeFileSync(accountKeyPath, accountKey);
      console.log(" * Account key saved to: " + accountKeyPath);
    }

    this.acme.initalizeKey(accountKey);

    // Register account key with letsencrypt
    let registrationResponse = await this.acme.registerAccountKey(this.config.email);
    if (registrationResponse.statusCode == 201) {
      console.log(' * New account registered');
    } else if (registrationResponse.statusCode == 409) {
      console.log(' * Account already registered');
    } else {
      // TODO: add proper error message
      console.log("Could not register key, StatusCode: " + res)
      return;
    }

    let registrationUrl = registrationResponse.headers.location;
    let newAgreement = await this.acme.hasNewAgreement(registrationUrl);
    if (newAgreement){
      console.log(' * New agreement found, accepting');
      let updateRegistrationResponse = await this.acme.updateRegistration(registrationUrl, newAgreement);
      // TODO Check for statusCode === 202 (Accepted)
    }
    console.log(" * Setup done");
  }

  async newCert(domain) {
    console.log(" * Requesting certificate for: " + domain);

    let accountKey = this.getAccountKey();
    if (!accountKey) {
      console.log(" * Could not load account key (try setup)");
      return;
    }

    this.acme.initalizeKey(accountKey);

    console.log(" * Finding hostedZoneId");
    let hostedZoneId = await this.r53.findHostedZoneId(domain);
    if (!hostedZoneId) {
      console.log(" * Could not find hosted zone for: " + domain);
      process.exit(1);
    }
    console.log(" * Found hostedZoneId: " + hostedZoneId);

    console.log(' * Requesting authorization challenge');
    let challenge = await this.acme.newTxtCallenge(domain);
    console.log(" * Creating challenge txt record with value: " + challenge.hashedKeyAuth);
    let createId = await this.r53.createChallengeTxtRecord(hostedZoneId, domain, challenge.hashedKeyAuth);
    await this.waitForRecord(createId);

    console.log(" * Validating record with letsencrypt")
    let validateResponse = await this.acme.validateChallenge(challenge);

    // TODO: should validate against letsencrypt that auth is accepted(202) and processed

    console.log(" * Deleting challange txt record");
    let deleteId = await this.r53.deleteChallengeTxtRecord(hostedZoneId, domain, challenge.hashedKeyAuth);
    await this.waitForRecord(deleteId);

    let timestamp = new Date().toISOString().replace(/[-:..]/g,'');
    let certDirectory = this.config.getCertDirectory(domain);
    this.mkdirSync(certDirectory);

    console.log(" * Generating certificate private key");
    let certKey = this.acme.generatePrivateKey();
    let certKeyPath = path.join(certDirectory, "key-" + timestamp + ".pem");
    fs.writeFileSync(certKeyPath, certKey);
    console.log(" * Saved private key to: " + certKeyPath);

    console.log(" * Generating CSR");
    let csr = this.acme.generateCSR(certKey, domain);
    let csrPath = path.join(certDirectory, "csr-" + timestamp + ".pem");
    fs.writeFileSync(csrPath, csr);
    console.log(" * Saved CSR to: " + csrPath);

    console.log(" * Requesting certificate");
    let certResponse = await this.acme.newCertificate(csr);
    let certPath = path.join(certDirectory, "cert-" + timestamp + ".pem");
    let cert = this.acme.convertDERtoPEM(certResponse.body);
    fs.writeFileSync(certPath, cert);
    console.log(" * Saved certificate to: " + certPath);

    console.log(" * Requesting certificate chain");
    let issuerCertUrl = certResponse.headers.link.match(/.*<(.*)>;rel="up".*/)[1];
    let issuerCertResponse = await this.acme.getIssuerCert(issuerCertUrl);
    let issuerCertPath = path.join(certDirectory, "chain-" + timestamp + ".pem");
    let issuerCert = this.acme.convertDERtoPEM(issuerCertResponse.body);
    fs.writeFileSync(issuerCertPath, issuerCert);
    console.log(" * Saved chain to: " + issuerCertPath);
  }

  async revokeCert(certificate) {
    console.log(" * Revoking certificate: " + certificate);

    let accountKey = this.getAccountKey();
    this.acme.initalizeKey(accountKey);

    console.log(" * Loading certificate")
    if (certificate[0] === '~') {
      certificate = path.join(process.env.HOME, certificate.slice(1));
    }
    let cert = fs.readFileSync(certificate);
    let der = this.acme.convertPEMtoDER(cert);

    console.log(" * Revoking against letsencrypt");
    let revokeResponse = await this.acme.revokeCert(der);

    if (revokeResponse.statusCode == 200) {
      console.log(" * Certificate revoked")
    } else {
      let body = JSON.parse(revokeResponse.body);
      console.log(" * Returned " + body.status + ": " + body.detail);
    }
  }
}
