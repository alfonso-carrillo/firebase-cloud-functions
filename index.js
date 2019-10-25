const functions = require('firebase-functions');
const { Storage } = require('@google-cloud/storage');
const os = require('os');
const path = require('path');
const spawn = require('child-process-promise').spawn;
const cors = require('cors')({origin: true});
const Busboy = require('busboy');
const fs = require('fs');
let gcs = new Storage({
    projectId: 'fireponcho',
    filename: 'fireponcho-firebase-adminsdk-qm9xp-e49731ae9f.json'
});

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.helloWorld = functions.https.onRequest((request, response) => {
    response.send("Hello from Firebase!");
});

exports.onFileChange = functions.storage.object().onFinalize(event => {
    const bucket = event.bucket;
    const contentType = event.contentType;
    const filePath = event.name;
    console.log('file detected');

    if (path.basename(filePath).startsWith('renamed-')) {
        console.log('already renamed this file');
        return;
    }

    const destBucket = gcs.bucket(bucket);
    const tmpFilePath = path.join(os.tmpdir(), path.basename(filePath));
    const metadata = { contentType };
    return destBucket.file(filePath).download({
        destination: tmpFilePath
    }).then(() => {
        return spawn('convert', [tmpFilePath,'-resize', '500x500', tmpFilePath]);
    }).then(() => {
        return destBucket.upload(tmpFilePath, {
            destination: 'renamed-' + path.basename(filePath),
            metadata
        });
    });
});

exports.onFileDeleted = functions.storage.object().onDelete((event) => {
    console.log(`file ${event.name} was deleted`);
    return;
});

exports.uploadFile = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        if (req.method !== 'POST') {
            return res.status(500).json({
                message: 'Not allowed!'
            });
        }

        const busboy = new Busboy({headers: req.headers});
        let uploadData = null;
        busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
            const filepath = path.join(os.tmpdir(), filename);
            uploadData = {file: filepath, type: mimetype};
            file.pipe(fs.createWriteStream(filepath));
        });

        busboy.on('finish', () => {
            const bucket = gcs.bucket('fireponcho.appspot.com');
            bucket.upload(uploadData.file, {
                uploadType: 'media',
                metadata: {
                    metadata: {
                        contentType: uploadData.type
                    }
                }
            })
            .then(() => {
                return res.status(200).json({
                    message: "It worked!"
                })
            })
            .catch(err => res.status(500).json({
                    error: err
                })
            );
        });
        busboy.end(req.rawBody);
    });
});

exports.onDataAdded = functions.database.ref('/message/{id}').onCreate((snapshot, context) => {
    console.log(context.params);
    const data = snapshot.val();
    const newData = {
        msg: `${context.params.id}-${data.msg.toUpperCase()}`
    };
    return snapshot.ref.parent.child('copiedData').set(newData);

});