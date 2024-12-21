import Client from 'ftp';

interface Options {
  host: string;
  port?: number;
  user?: string;
  password?: string;
}

export function uploadFile(localPath: string, remotePath: string, options: Options): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new Client();

    client.on('ready', () => {
      client.put(localPath, remotePath, (err) => {
        if (err) {
          client.end();
          return reject(err);
        }
        client.end();
        resolve();
      });
    });

    client.on('error', (err) => {
      reject(err);
    });

    client.connect(options);
  });
}
