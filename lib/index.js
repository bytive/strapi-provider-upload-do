"use strict";
const AWS = require('aws-sdk');
const URI = require('urijs');
const crypto = require('crypto');
const sharp = require('sharp');

class FileLocationConverter {
  constructor(config) {
    this.config = config;
  }

  getKey(file) {
    const filename = `${file.hash}${file.ext}`;
    if (!this.config.directory) return filename;
    return `${this.config.directory}/${filename}`;
  }

  getUrl(data) {
    if (!this.config.cdn) return data.Location;
    var parts = {};
    URI.parseHost(this.config.cdn, parts);
    parts.protocol = "https"; // Force https
    parts.path = data.Key;
    return URI.build(parts);
  }
}

const handleImage = async(file) =>{
  try{
    console.log("mime",file.mime.includes("image"))
  if(file.mime.includes("image"))
  {
  
  // blur image buffer ...
  const blur = await sharp("./logo.png")
  .resize({
    width: Math.round(file.width / 4), // Adjust the size as needed
    height: Math.round(file.height / 4), // Adjust the size as needed
    fit: 'contain'
  })
  .blur()
  .toBuffer()

  const positionX = file.width - Math.round(file.width / 4) - 10; // Adjust margin as needed
  const positionY = file.height - Math.round(file.height / 4) - 10; // Adjust margin as needed


  const out = await sharp(file.buffer).composite([{ input : blur, left: positionX, top: positionY }]).toBuffer()
  return out
  }
  else{
    return null
  }
}
catch(err){
  return null
}
}
module.exports = {
  provider: "do",
  name: "Digital Ocean Spaces",
  auth: {
    key: {
      label: "Key",
      type: "text"
    },
    secret: {
      label: "Secret",
      type: "text"
    },
    endpoint: {
      label: "Endpoint (e.g. 'fra1.digitaloceanspaces.com')",
      type: "text",
    },
    cdn: {
      label: "CDN Endpoint (Optional - e.g. 'https://cdn.space.com')",
      type: "text",
    },
    space: {
      label: "Space (e.g. myspace)",
      type: "text",
    },
    directory: {
      label: 'Directory (Optional - e.g. directory - place when you want to save files)',
      type: 'text'
    }
  },
  init: config => {
    const endpoint = new AWS.Endpoint(config.endpoint);
    const converter = new FileLocationConverter(config);
    const S3 = new AWS.S3({
      endpoint: endpoint,
      accessKeyId: config.key,
      secretAccessKey: config.secret,
      params: {
        ACL: 'public-read',
        Bucket: config.space,
        CacheControl: 'public, max-age=31536000, immutable'
      },
    });

    const upload =  (file) =>  
    new Promise((resolve, reject) => {
      //--- Compute the file key.
     
      file.hash = crypto.createHash('md5').update(file.hash).digest("hex");
      //--- Upload the file into the space (technically the S3 Bucket)
      S3.upload({
          Key: converter.getKey(file),
          Body: Buffer.from(file.buff ? file.buff : file.buffer, "binary"),
          ContentType: file.mime
        },

        //--- Callback handler
        (err, data) => {
          if (err) return reject(err);
          file.url = converter.getUrl(data);
          resolve();
        });
    });

    return {
      upload,

      uploadStream: file => new Promise((resolve, reject) => {
        const _buf = [];

        file.stream.on('data', chunk => _buf.push(chunk));
        file.stream.on('end', () => {

          file.buffer = Buffer.concat(_buf);
          handleImage(file).then(data =>{
            file.buff =  data
            resolve(upload(file));
            })  
          // resolve(upload(file));
        });
        file.stream.on('error', err => reject(err));
      }),

      delete: file => new Promise((resolve, reject) => {

          //--- Delete the file from the space
          S3.deleteObject({
              Bucket: config.bucket,
              Key: converter.getKey(file),
            },

            //--- Callback handler
            (err, data) => {
              if (err) return reject(err);
              else resolve();
            })
        }
      )
    }
  
  }
}
