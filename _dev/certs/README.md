# Certs dev (générés localement, gitignorés)

CA + cert serveur générés par openssl (voir `vite.config.ts` — remplace vite-plugin-mkcert
dont la CA contenait des octets Unicode invalides, copiés depuis le nom complet du compte
macOS, que Safari desktop/iOS rejette).

Régénérer (nouvelle IP LAN, expiration) : depuis `_dev/certs/`, ajouter l'IP dans la section
`[alt]` de `openssl.cnf` puis :

```sh
openssl req -x509 -newkey rsa:2048 -nodes -keyout rootCA-key.pem -out rootCA.pem -days 1825 \
  -subj "/O=www-aaa dev CA/CN=www-aaa dev CA" -config openssl.cnf -extensions v3_ca
openssl req -newkey rsa:2048 -nodes -keyout dev-key.pem -out dev.csr \
  -subj "/O=www-aaa dev/CN=www-aaa dev" -config openssl.cnf
openssl x509 -req -in dev.csr -CA rootCA.pem -CAkey rootCA-key.pem -CAcreateserial \
  -out dev-cert.pem -days 825 -extfile openssl.cnf -extensions v3_leaf && rm dev.csr rootCA.srl
```

Nota : si seule la feuille (dev-cert) est régénérée avec la même CA, aucun re-trust n'est
nécessaire. Si `rootCA.pem` change, re-truster :

- macOS : `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain _dev/certs/rootCA.pem`
- iOS Simulator (booté) : `xcrun simctl keychain booted add-root-cert _dev/certs/rootCA.pem`
