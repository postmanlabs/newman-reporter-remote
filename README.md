# newman-reporter-remote
A Remote reporter for [Newman](https://github.com/postmanlabs/newman) that posts aggregated information for each execution
in a collection run to the remote location or save to disk in JSON format.
This needs to be used in conjunction with Newman so that it can recognize Remote reporting options.

## Install
> The installation should be global if Newman is installed globally, local otherwise. (Replace -g from the command below with -S for a local installation)

```console
$ npm install -g newman-reporter-remote
```

## Usage
In order to enable this reporter, specify `remote` in Newman's `-r` or `--reporters` option.

```console
# saving execution summary to disk
$ newman run collection.json -r remote --reporter-remote-export './summary.json'

# posting execution summary to remote endpoint
$ newman run collection.json -r remote --reporter-remote-api '{"url": "http://localhost:3000", "method": "POST"}'
```

### Options

#### With Newman CLI

| CLI Option  | Description       |
|-------------|-------------------|
| `--reporter-remote-run-id <runId>` | Set custom run id. (default: UUID4) |
| `--reporter-remote-export <path>` | Specify a path where the output JSON file will be written to disk. If not specified, the file will be written to `newman/` in the current working directory. |
| `--reporter-remote-api <json>` | Specify the [request.js options](https://github.com/request/request/#requestoptions-callback) which will be used to post execution summary to the specified endpoint. |

#### With Newman as a Library
The CLI functionality is available for programmatic use as well.

```javascript
const newman = require('newman');

newman.run({
    collection: require('./examples/sample-collection.json'), // can also provide a URL or path to a local JSON file.
    reporters: 'remote',
    reporter: {
        remote: {
            // set custom run id
            runId: '12345',
            // export execution summary to disk
            // if path is not specified, the file will be written to `newman/` in the current working directory.
            export: './summary.json',

            // post execution summary to remote endpoint
            // request.js(https://github.com/request/request) options object
            api: {
                url: 'http://localhost:3000',
                method: 'POST'
            },

            // custom handling of execution summary
            callback: function (err, summary) {
                // custom logic goes here
            }
        }
    }
}, function (err) {
	if (err) { throw err; }
    console.log('collection run complete!');
});
```

## Compatibility

| **newman-reporter-remote** | **newman** | **node** |
|:--------------------------:|:----------:|:--------:|
|           v0.1.0           | >= v4.0.0  | >= v6.x  |

## Community Support

<img src="https://avatars1.githubusercontent.com/u/3220138?v=3&s=120" align="right" />
If you are interested in talking to the Postman team and fellow Newman users, you can find us on our <a href="https://community.getpostman.com">Postman Community Forum</a>. Feel free to drop by and say hello. You'll find us posting about upcoming features and beta releases, answering technical support questions, and contemplating world peace.

Sign in using your Postman account to participate in the discussions and don't forget to take advantage of the <a href="https://community.getpostman.com/search?q=newman">search bar</a> - the answer to your question might already be waiting for you! Don’t want to log in? Then lurk on the sidelines and absorb all the knowledge.

## License
This software is licensed under Apache-2.0. Copyright Postdot Technologies, Inc. See the [LICENSE.md](LICENSE.md) file for more information.
