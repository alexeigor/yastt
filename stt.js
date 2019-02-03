/*
    Yandex speechkit cloud :: recognize client

    Install:
	* npm install grpc
	* npm install @grpc/proto-loader
	* npm install yargs
*/

const PROTO_PATH = [__dirname + '/stt_service.proto'];
const FORMAT_PCM = 'LINEAR16_PCM';

const args = require('yargs')
    .options({
        'folder_id': {
            describe: 'folder ID',
            demandOption: true,
        },
        'token': {
            describe: 'IAM token',
            demandOption: true,
        },
        'path': {
            describe: 'audio file name',
            demandOption: false,
            default: ''
        },
        'stderr_log_file': {
            describe: 'stderr log file path',
            demandOption: false,
            default: ''
        }
    })
    .argv;

main(args.path, args.token, args.folder_id, args.stderr_log_file);

function createSttClient(iam_token, folder_id) {
    var grpc = require('grpc');
    var protoLoader = require('@grpc/proto-loader');
    var packageDefinition = protoLoader.loadSync(
        PROTO_PATH,
        {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });

    metadata = new grpc.Metadata();
    metadata.set('authorization', 'Bearer ' + iam_token);

    var sttProto = grpc.loadPackageDefinition(packageDefinition).yandex.cloud.ai.stt.v2;

    var sslCreds = grpc.credentials.createSsl();
    var client = new sttProto.SttService('stt.api.cloud.yandex.net:443', sslCreds);
    var sttService = client.StreamingRecognize(metadata);

    // send config to server
    var config = {
        config: {
            folder_id: folder_id,
            specification: {
                language_code: "ru-RU",
                sample_rate_hertz: 16000,
                audio_encoding: FORMAT_PCM,
                profanity_filter: false,
                partial_results: false
            }
        },
    };
    sttService.write(config);

    return sttService;
}

function main(audio_file_name, token, folder_id, stderr_log_file) {
    var fs = require('fs');
    Writable = require('stream').Writable;
    const { pipeline } = require('stream');
    var startTime = Date.now();

    /* mirror stderr to file */
    if (stderr_log_file != "") {
        var fn = process.stderr.write;
        var sttStderrLog = fs.createWriteStream(stderr_log_file)

        function write() {
            fn.apply(process.stderr, arguments);
            sttStderrLog.write.apply(sttStderrLog, arguments);
        }

        process.stderr.write = write;
    }

    var sttService = createSttClient(token, folder_id);

    /* --- */
    var transformStream = Writable();
    transformStream._write = function (chunk, enc, next) {
        // send audio chunks
        console.error("[" + (Date.now() - startTime) + " ms] send chunk of size " + chunk.length + " bytes")
        sttService.write({audio_content: chunk});
        next()
    };

    transformStream.on('finish', () => {
        sttService.end();
        console.error("[" + (Date.now() - startTime) + " ms] all chunks are sent now")
    });

    var outStream = process.stdout;

    outStream.on('error', function (error) {
        console.error("output stream error, so exit");
        console.error("Error code: " + error.code);
        console.error("Error message: " + error.message);
        process.exit(1);
    });

    /* --- */
    sttService.on('error', function (error) {
        console.error("Error code: " + error.code);
        console.error("Error message: " + error.message);
        process.exit(1);
    });

    sttService.on('data', function (response) {
        if (response.chunks.length > 0) {
            console.error("[" + (Date.now() - startTime) + " ms] received chunk of response")
            outStream.write("Recognized message: " + response.chunks[0].alternatives[0].text + "\n");
            outStream.write("Is final: " + response.chunks[0].final + "\n")
        }
    });

    sttService.on('end', function() {
        // outStream.close();
    });

    var inputStream = (audio_file_name == "") ? process.stdin : fs.createReadStream(audio_file_name);

    inputStream.on('error', function (error) {
        console.error("Error code: " + error.code);
        console.error("Error message: " + error.message);
    });


    inputStream.pipe(transformStream);
}