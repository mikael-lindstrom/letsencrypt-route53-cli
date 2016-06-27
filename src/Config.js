import fs from 'fs'
import path from 'path'

export default class Config {

  constructor() {
    this.configDirectory = "~.letsencrypt-certs";
    this.configFile = "config.json";
    this.accountKey = "accountKey.pem";
  }

  getConfigDirectory() {
    if (this.configDirectory[0] === '~') {
      return path.join(process.env.HOME, this.configDirectory.slice(1));
    }
    return this.configDirectory;
  }

  getAccountKeyPath() {
    if (this.configDirectory[0] === '~') {
      return path.join(process.env.HOME, this.configDirectory.slice(1), this.accountKey);
    }
    return path.join(this.configDirectory, this.accountKey);
  }

  getCertDirectory(domain) {
    if (this.configDirectory[0] === '~') {
      return path.join(process.env.HOME, this.configDirectory.slice(1), domain);
    }
    return path.join(this.configDirectory.slice(1), domain);
  }

  getConfigJson() {
    let config = {
      email: this.email
    }
    return config;
  }

  setConfigJson(json) {
    let config = JSON.parse(json);
    this.email = config.email;
  }

  loadConfigFile() {
    try {
      let json = fs.readFileSync(path.join(this.getConfigDirectory(), this.configFile));
      this.setConfigJson(json.toString());
    } catch (e) {
      return false;
    }
    return true;
  }

  validateConfig() {
    if (!this.email) {
      throw Error('Invalid config, email missing (run setup -e email)');
    }
  }

  saveConfigFile() {
    this.validateConfig();
    let config = this.getConfigJson();
    fs.writeFileSync(path.join(this.getConfigDirectory(), this.configFile), JSON.stringify(config, null, ' '));
  }

  setEmail(email) {
    this.email = email;
  }

  getEmail(email) {
    return this.email;
  }
}
