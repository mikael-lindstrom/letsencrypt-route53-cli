#!/usr/bin/env node

import 'babel-polyfill'
import commander from 'commander'
import meta from './../package.json'
import Cli from './Cli.js'

var cli = new Cli();

process.on('unhandledRejection', function(reason, p) {
    console.log("Unhandled Rejection at: Promise ", p, " reason: ", reason);
});

commander
  .version(meta.version);

commander
  .command('setup')
  .description('Setup account key and register with letsencrypt')
  .option('-e, --email <email>', 'Email for the account')
  .action((options) => {
    cli.setup(options.email);
  });

commander
  .command('new-cert [domain]')
  .description('Requests a new certificate')
  .action((domain, options) => {
    cli.newCert(domain);
  });

// TODO add support for revoking using private key
commander
  .command('revoke-cert [certificate]')
  .description('Revokes a certificate')
  .action((certificate, options) => {
    cli.revokeCert(certificate);
  });

// TODO add show config options

// Default to output help
commander
  .command('*', undefined, { noHelp:true, isDefault:true })
  .action((command) => {
    console.error('unrecognized command: ' + command);
    commander.outputHelp();
  });

commander
  .parse(process.argv);

// Commanders isDefault does not seem to work properly with .action, using this as a workaround´
if (!process.argv.slice(2).length) {
  commander.outputHelp();
}
