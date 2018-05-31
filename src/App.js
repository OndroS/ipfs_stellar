import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
import ipfsAPI from 'ipfs-api';
import StellarSdk from 'stellar-sdk';

const ipfs = ipfsAPI({ host: 'ipfs.infura.io', port: 5001, protocol: 'https' });
const serverUrl = 'https://horizon-testnet.stellar.org';// TESTNET
const server = new StellarSdk.Server(serverUrl);
var account = {
    public:'GDJ2QE5DGI2P4LPVUHELCAHTM4LHC2RR7BAPMLMB4ZBO3ZXRXNA4VABG',
    secret:'your-secret'
};

// Derive Keypair object and public key (that starts with a G) from the secret
var sourceKeypair = StellarSdk.Keypair.fromSecret(account.secret);
var sourcePublicKey = sourceKeypair.publicKey();

export default class App extends Component {
    constructor(props) {
        super(props);
        this.state = {
            value: '',
            txMemo: '',
            accountAddress: 'GDJ2QE5DGI2P4LPVUHELCAHTM4LHC2RR7BAPMLMB4ZBO3ZXRXNA4VABG',
            post: ''
        };

        this.handleChange = this.handleChange.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
    }

    handleChange(event) {
        this.setState({value: event.target.value});
    }

    componentDidMount() {
        this._getData(account, 'ipfs');
    }

    handleSubmit(event) {
        let xxx = this;
        event.preventDefault();

        const buffer = Buffer.from(this.state.value);
        ipfs.files.add(buffer, (err, ipfsHash) => {
            this.setState({txMemo: ipfsHash[0].path})

            var transactData = {name:'ipfs', value:ipfsHash[0].path};

            StellarSdk.Network.useTestNetwork();
            server.loadAccount(sourcePublicKey)
                .then(function(account) {
                    var transaction = new StellarSdk.TransactionBuilder(account)
                    // Add a payment operation to the transaction
                        .addOperation(
                            /*
                                StellarSdk.Operation.payment({
                                destination: receiverPublicKey,
                                // The term native asset refers to lumens
                                asset: StellarSdk.Asset.native(),
                                // Specify 350.1234567 lumens. Lumens are divisible to seven digits past
                                // the decimal. They are represented in JS Stellar SDK in string format
                                // to avoid errors from the use of the JavaScript Number data structure.
                                amount: '0.00001',
                            }),
                            */
                            StellarSdk.Operation.manageData(transactData)
                        )
                        // Uncomment to add a memo (https://www.stellar.org/developers/learn/concepts/transactions.html)
                        //.addMemo(
                            //StellarSdk.Memo.hash(xxx.getBytes32FromIpfsHash(ipfsHash[0].path))
                        //)
                        .build();

                    // Sign this transaction with the secret key
                    // NOTE: signing is transaction is network specific. Test network transactions
                    // won't work in the public network. To switch networks, use the Network object
                    // as explained above (look for StellarSdk.Network).
                    transaction.sign(sourceKeypair);

                    // Let's see the XDR (encoded in base64) of the transaction we just built
                    console.log(transaction.toEnvelope().toXDR('base64'));

                    // Submit the transaction to the Horizon server. The Horizon server will then
                    // submit the transaction into the network for us.
                    server.submitTransaction(transaction)
                        .then(function(transactionResult) {
                            console.log(JSON.stringify(transactionResult, null, 2));
                            console.log('Success! View the transaction at: ');
                            console.log(transactionResult._links.transaction.href);
                        })
                        .catch(function(err) {
                            console.log('An error has occured:');
                            console.log(err);
                        });
                })
                .catch(function(e) {
                    console.error(e);
                });

            this._confirmPayment(this.state.txMemo); // Listen to see if the transaction went through
        });

    }

    // If successful, pin our post on the IPFS node
    _pinIpfsListing(ipfsHash) {
        ipfs.pin.add(ipfsHash)
    }

    _confirmPayment(ipfsHash) {
        server.transactions().forAccount('GDJ2QE5DGI2P4LPVUHELCAHTM4LHC2RR7BAPMLMB4ZBO3ZXRXNA4VABG').cursor('now').stream({
            onmessage: (transaction) => {
                if(transaction.memo == ipfsHash) {
                    // Yes, it made it on the blockchain!
                    transaction.operations().then((ops) => {
                        var payment = ops._embedded.records[0];
                        if(parseInt(parseFloat(payment.amount)) < 1) {
                            console.error('Payment insufficient. Post not saved!');
                        } else {
                            this._pinIpfsListing(ipfsHash);
                        }
                    }).catch((error) => {
                        error.target.close(); // Close stream
                        console.error('Payment Error: ', error);
                        alert('Error confirming payment. Try again later');
                    });
                }
            },
            onerror: (error) => {
                error.target.close(); // Close stream
                console.error('Streaming Error: ', error);
            }
        });
    }

    _getIPFS(getIpfsListing) {
        let xxx = this;
        ipfs.files.get(getIpfsListing, function (err, files) {

            //return false;
            files.forEach((file) => {
                console.log('file ', file)
                const post = file.content.toString('utf8');
                xxx.setState({post:post})
            })
        })
    }

    // To get data, a simple HTTP GET would suffice
    _getData(act, key) {
        let xxx = this;
        var url = serverUrl + '/accounts/' + act.public + '/data/' + key;
        this._webget(url, function(json){
            if(json.status==404){ console.log('Error getting data for key '+key); }
            else {
                console.log(key+' : '+atob(json.value)); /* atob() base64 */
                xxx._getIPFS(atob(json.value));
            }
        });
    }

    // Simple XmlHttpRequest
    _webget(url, callback) {
        var http = new XMLHttpRequest();
        http.open("GET", url, true);
        http.onreadystatechange = function() {
            if(http.readyState==4) {
                console.log('Response: '+http.responseText);
                var json = null;
                try {
                    json = JSON.parse(http.responseText);
                } catch(ex) {
                    console.log("JSON ERROR", ex.message);
                    json = { error: true, message: ex.message };
                }
                callback(json);
            }
        };
        http.send();
    }

    render() {
        return (
            <div className="App">
                <header className="App-header">
                    <img src={logo} className="App-logo" alt="logo" />
                    <h1 className="App-title">Welcome to React</h1>
                </header>
                <br/>
                <form onSubmit={this.handleSubmit}>
                    <label>
                        Content:
                        <input type="text" value={this.state.value} onChange={this.handleChange} />
                    </label>
                    <input type="submit" value="Submit" />
                </form>
                <p>Data: </p> {this.state.post}
            </div>
        );
    }
}