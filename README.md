# BCH RPC Explorer

[![npm version][npm-ver-img]][npm-ver-url] [![NPM downloads][npm-dl-img]][npm-dl-url]


Simple, database-free Bitcoin Cash blockchain explorer, via RPC. Built with Node.js, express, bootstrap-v4.

This tool is intended to be a simple, self-hosted explorer for the Bitcoin blockchain, driven by RPC calls to your own bitcoind node. This tool is easy to run but currently lacks features compared to database-backed explorers.

Live demo available at: [https://explorer.bitcoinabc.org](https://explorer.bitcoinabc.org)

# Features

* Network Summary "dashboard"
* View details of blocks, transactions, and addresses
* Analysis tools for viewing stats on blocks, transactions, and miner activity
* View JSON content used to generate most pages
* Search by transaction ID, block hash/height, and address
* Optional transaction history for addresses by querying from ElectrumX and blockchair.com
* Mempool summary, with fee, size, and age breakdowns
* RPC command browser and terminal

# Changelog / Release notes

See [CHANGELOG.md](/CHANGELOG.md).

# Getting started

The below instructions are geared toward BCH, but can be adapted easily to other coins.

## Prerequisites

1. Recent version of Docker
1. Install and run a full, archiving node - [instructions](https://hub.docker.com/r/bitcoinabc/bitcoin-abc/). Ensure that your bitcoin node has full transaction indexing enabled (`txindex=1`) and the RPC server enabled (`server=1`).
2. Synchronize your node with the Bitcoin network.

## Instructions

On the project base directory:

```bash
docker build -t bch-rpc-explorer .
docker run -p 3002:3002 bch-rpc-explorer --bitcoind-user [rpcusername] --bitcoind-pass [rpcpassword]
```

If have a mainnet node running with the default datadir and port, this should work.
Open [http://127.0.0.1:3002/](http://127.0.0.1:3002/) to view the explorer.

### Configuration (Advanced)

Configuration options may be passed as environment variables
or by creating an env file at `~/.config/bch-rpc-explorer.env`
or at `.env` in the working directory.
See [.env-sample](.env-sample) for a list of the options and details for formatting `.env`.

You may also pass options as CLI arguments, for example:

```bash
docker run bch-rpc-explorer --port 8080 --bitcoind-port 18443 --bitcoind-user [rpcusername] --bitcoind-pass [rpcpassword]
```

See `docker run bch-rpc-explorer --help` for the full list of CLI options.

# Support

* [bitcoincash:qqeht8vnwag20yv8dvtcrd4ujx09fwxwsqqqw93w88](bitcoincash:qqeht8vnwag20yv8dvtcrd4ujx09fwxwsqqqw93w88)


[npm-ver-img]: https://img.shields.io/npm/v/bch-rpc-explorer.svg?style=flat
[npm-ver-url]: https://www.npmjs.com/package/bch-rpc-explorer
[npm-dl-img]: http://img.shields.io/npm/dm/bch-rpc-explorer.svg?style=flat
[npm-dl-url]: https://npmcharts.com/compare/bch-rpc-explorer?minimal=true

