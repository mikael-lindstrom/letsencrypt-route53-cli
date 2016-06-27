# letsencrypt-route53

Command-line interface to create and revoke certificates using letsencrypt. Currently under heavy development.

### Installation
Currently this is not pushed to npm.
```
npm install -g .
```

### Usage
Run setup to create a account key and register it with letsencrypt. The key will be saved to `~/.letsencrypt`.
```
letsencrypt-route53 setup -e your-email@your-domain.com
```

To create a new certificate you need AWS credentials loaded into your shell and a hosted zone in AWS for the domain you want to create the certificate for.
```
letsencrypt-route53 new-cert your-domain.com
```

To revoke the certificate.
```
letsencrypt-route53 revoke-cert ~/.letsencrypt-certs/your-domain.com/cert-timestamp.pem
```
