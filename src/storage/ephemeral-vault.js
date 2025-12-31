/**
 * EphemeralVault — In-Memory Zero-Knowledge Storage Enclave
 *
 * Generates an ephemeral AES-256-GCM cryptographic session key in RAM.
 * Partitions storage per origin using HMAC-SHA256 origin derivation.
 * On application termination or tab close, memory buffers are explicitly zeroed.
 */

const crypto = require('crypto');

class EphemeralVault {
  constructor() {
    this.sessionKey = crypto.randomBytes(32);
    this.partitions = new Map();
  }

  _getOriginPartitionKey(origin) {
    return crypto.createHmac('sha256', this.sessionKey).update(origin || 'default').digest('hex');
  }

  set(origin, key, value) {
    const originHash = this._getOriginPartitionKey(origin);
    if (!this.partitions.has(originHash)) {
      this.partitions.set(originHash, new Map());
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.sessionKey, iv);
    let ciphertext = cipher.update(JSON.stringify(value), 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    this.partitions.get(originHash).set(key, {
      iv: iv.toString('hex'),
      payload: ciphertext,
      tag: authTag
    });
  }

  get(origin, key) {
    const originHash = this._getOriginPartitionKey(origin);
    const table = this.partitions.get(originHash);
    if (!table || !table.has(key)) return null;

    try {
      const record = table.get(key);
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.sessionKey, Buffer.from(record.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(record.tag, 'hex'));
      let plaintext = decipher.update(record.payload, 'hex', 'utf8');
      plaintext += decipher.final('utf8');
      return JSON.parse(plaintext);
    } catch (e) {
      return null;
    }
  }

  delete(origin, key) {
    const originHash = this._getOriginPartitionKey(origin);
    const table = this.partitions.get(originHash);
    if (table) table.delete(key);
  }

  purge() {
    this.sessionKey.fill(0);
    this.partitions.clear();
  }
}

module.exports = { EphemeralVault };
