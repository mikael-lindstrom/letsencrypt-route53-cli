import aws from 'aws-sdk';

export default class Route53 {

  constructor() {
    this.r53 = new aws.Route53();
  }

  async findHostedZoneId(domain) {
    let params = {
      DNSName: domain
    };
    let response = await this.r53.listHostedZonesByName(params).promise();
    for (let hostedZone of response.HostedZones) {
      if (hostedZone.Name.replace(/\.+$/, "") === domain) { // Removes trailing '.'
        return hostedZone.Id;
      }
    }
    return undefined;
    //throw Error("Could not find hosted zone for domain name: " + domain);
  }

  async isRecordIsInsync(changeId) {
    var params = {
      Id: changeId
    };
    let result = await this.r53.getChange(params).promise();
    return result.ChangeInfo.Status == 'INSYNC';
  }

  async createChallengeTxtRecord(hostedZoneId, domain, value) {
    var params = {
      ChangeBatch: {
        Changes: [
          {
            Action: 'CREATE',
            ResourceRecordSet: {
              Name: '_acme-challenge.' + domain,
              Type: 'TXT',
              ResourceRecords: [
                {
                  Value: '"' + value + '"'
                }
              ],
              TTL: 300
            }
          }
        ],
        Comment: 'LetsEncrypt validation record'
      },
      HostedZoneId: hostedZoneId
    };
    var result = await this.r53.changeResourceRecordSets(params).promise();
    return result.ChangeInfo.Id;
  }

  async deleteChallengeTxtRecord(hostedZoneId, domain, value) {
    var params = {
      ChangeBatch: {
        Changes: [
          {
            Action: 'DELETE',
            ResourceRecordSet: {
              Name: '_acme-challenge.' + domain,
              Type: 'TXT',
              ResourceRecords: [
                {
                  Value: '"' + value + '"'
                }
              ],
              TTL: 300
            }
          }
        ]
      },
      HostedZoneId: hostedZoneId
    };
    var result = await this.r53.changeResourceRecordSets(params).promise();
    return result.ChangeInfo.Id;
  }
}
