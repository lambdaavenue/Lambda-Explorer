var express = require('express');
var router = express.Router();
var qrcode = require('qrcode');
var bitcoinjs = require('bitcoinjs-lib');
var cashaddrjs = require('cashaddrjs');
var sha256 = require("crypto-js/sha256");
var hexEnc = require("crypto-js/enc-hex");
var Decimal = require("decimal.js");

var utils = require('./../app/utils.js');
var config = require("./../app/config.js");
var coreApi = require("./../app/api/coreApi.js");
var addressApi = require("./../app/api/addressApi.js");
var rpcApi = require("./../app/api/rpcApi.js");

router.get("/", async (req, res, next) => {
	if (req.session.host == null || req.session.host.trim() == "") {
		if (req.cookies['rpc-host']) {
			res.locals.host = req.cookies['rpc-host'];
		}

		if (req.cookies['rpc-port']) {
			res.locals.port = req.cookies['rpc-port'];
		}

		if (req.cookies['rpc-username']) {
			res.locals.username = req.cookies['rpc-username'];
		}

		res.render("connect");
		res.end();

		return;
	}

	res.locals.homepage = true;

	// variables used by blocks-list.pug
	res.locals.offset = 0;
	res.locals.sort = "desc";

	var promises = [];

	var limit = config.site.browseBlocksPageSize;
	var offset = 0;
	var sort = "desc";

	// hardcoded, yes
	limit = 15;

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = "/";

	try {
		getblockchaininfo = await coreApi.getBlockchainInfo();
		res.locals.blockCount = getblockchaininfo.blocks;
		res.locals.blockOffset = offset;

		var blockHeights = [];
		if (sort == "desc") {
			for (var i = (getblockchaininfo.blocks - offset); i > (getblockchaininfo.blocks - offset - limit - 1); i--) {
				if (i >= 0) {
					blockHeights.push(i);
				}
			}
		} else {
			for (var i = offset - 1; i < (offset + limit); i++) {
				if (i >= 0) {
					blockHeights.push(i);
				}
			}
		}

		res.locals.blocks = await coreApi.getBlocksByHeight(blockHeights);
		var rawblockstats = await coreApi.getBlocksStatsByHeight(blockHeights);

		if (rawblockstats != null && rawblockstats.length > 0 && rawblockstats[0] != null) {
			res.locals.blockstatsByHeight = {};

			for (var i = 0; i < rawblockstats.length; i++) {
				var blockstats = rawblockstats[i];
				const finalized = await coreApi.isFinalBlock(blockstats.blockhash);

				res.locals.blockstatsByHeight[blockstats.height] = blockstats;
				res.locals.blockstatsByHeight[blockstats.height].finalized = finalized;
			}
		}

		res.render("blocks");
		utils.perfMeasure(req);

	} catch (err) {
		res.locals.pageErrors.push(utils.logError("32974hrbfbvc", err));
		res.locals.userMessage = "Error: " + err;

		res.render("blocks");
	}
});

router.get("/changeSetting", function (req, res, next) {
	if (req.query.name) {
		req.session[req.query.name] = req.query.value;

		res.cookie('user-setting-' + req.query.name, req.query.value);
	}

	res.redirect(req.headers.referer);
});

router.get("/search", function (req, res, next) {
	res.render("search");
});

router.post("/search", function (req, res, next) {
	if (!req.body.query) {
		req.session.userMessageType = "dark"
		req.session.userMessage = "Enter a block height, block hash, or transaction id.";

		res.redirect("/");

		return;
	}

	var query = req.body.query.toLowerCase().trim();
	var rawCaseQuery = req.body.query.trim();

	req.session.query = req.body.query;

	if (query.length == 64) {
		coreApi.getRawTransaction(query).then(function (tx) {
			if (tx) {
				res.redirect("/tx/" + query);

				return;
			}

			coreApi.getBlockHeader(query).then(function (blockHeader) {
				if (blockHeader) {
					res.redirect("/block/" + query);

					return;
				}

				coreApi.getAddress(rawCaseQuery).then(function (validateaddress) {
					if (validateaddress && validateaddress.isvalid) {
						res.redirect("/address/" + rawCaseQuery);

						return;
					}
				});

				req.session.userMessage = "No results found for query: " + query;

				res.redirect("/");

			}).catch(function (err) {
				req.session.userMessage = "No results found for query: " + query;

				res.redirect("/");
			});

		}).catch(function (err) {
			coreApi.getBlockHeader(query).then(function (blockHeader) {
				if (blockHeader) {
					res.redirect("/block/" + query);

					return;
				}

				req.session.userMessage = "No results found for query: " + query;

				res.redirect("/");

			}).catch(function (err) {
				req.session.userMessage = "No results found for query: " + query;

				res.redirect("/");
			});
		});

	} else if (!isNaN(query)) {
		coreApi.getBlockHeaderByHeight(parseInt(query)).then(function (blockHeader) {
			if (blockHeader) {
				res.redirect("/block-height/" + query);

				return;
			}

			req.session.userMessage = "No results found for query: " + query;

			res.redirect("/");
		}).catch(function (err) {
			req.session.userMessage = "No results found for query: " + query;

			res.redirect("/");
		});
	} else {
		coreApi.getAddress(rawCaseQuery).then(function (validateaddress) {
			if (validateaddress && validateaddress.isvalid) {
				res.redirect("/address/" + rawCaseQuery);

				return;
			}

			req.session.userMessage = "No results found for query: " + rawCaseQuery;

			res.redirect("/");
		});
	}
});

router.get("/block-height/:blockHeight", async (req, res, next) => {
	var blockHeight = parseInt(req.params.blockHeight);

	res.locals.blockHeight = blockHeight;

	res.locals.result = {};

	var limit = config.site.blockTxPageSize;
	var offset = 0;

	if (req.query.limit) {
		limit = parseInt(req.query.limit);

		// for demo sites, limit page sizes
		if (config.demoSite && limit > config.site.blockTxPageSize) {
			limit = config.site.blockTxPageSize;

			res.locals.userMessage = "Transaction page size limited to " + config.site.blockTxPageSize + ". If this is your site, you can change or disable this limit in the site config.";
		}
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.paginationBaseUrl = "/block-height/" + blockHeight;

	try {
		blockHash = await rpcApi.getBlockHash(blockHeight)

		const result1 = await coreApi.getBlockByHashWithTransactions(blockHash, limit, offset)
		res.locals.result.getblock = result1.getblock;
		res.locals.result.transactions = result1.transactions;
		res.locals.result.txInputsByTransaction = result1.txInputsByTransaction;

		const result2 = await coreApi.getBlockStats(blockHash)
		res.locals.result.blockstats = result2;

		const result3 = await coreApi.isFinalBlock(blockHash)
		res.locals.result.blockstats.finalized = result3;

		res.render("block");
		utils.perfMeasure(req);

	} catch (err) {
		res.locals.userMessageMarkdown = `Failed loading block: height=**${blockHeight}**`;
		res.locals.pageErrors.push(utils.logError("389wer07eghdd", err));
		res.render("block");
	};
});

router.get("/block/:blockHash", async (req, res, next) => {
	var blockHash = req.params.blockHash;

	res.locals.blockHash = blockHash;

	res.locals.result = {};

	var limit = config.site.blockTxPageSize;
	var offset = 0;

	if (req.query.limit) {
		limit = parseInt(req.query.limit);

		// for demo sites, limit page sizes
		if (config.demoSite && limit > config.site.blockTxPageSize) {
			limit = config.site.blockTxPageSize;

			res.locals.userMessage = "Transaction page size limited to " + config.site.blockTxPageSize + ". If this is your site, you can change or disable this limit in the site config.";
		}
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.paginationBaseUrl = "/block/" + blockHash;

	try {
		const result1 = await coreApi.getBlockByHashWithTransactions(blockHash, limit, offset);
		res.locals.result.getblock = result1.getblock;
		res.locals.result.transactions = result1.transactions;
		res.locals.result.txInputsByTransaction = result1.txInputsByTransaction;


		const result2 = await coreApi.getBlockStats(blockHash)
		res.locals.result.blockstats = result2;

		const result3 = await coreApi.isFinalBlock(blockHash)
		res.locals.result.blockstats.finalized = result3

		res.render("block");
		utils.perfMeasure(req);

	} catch (err) {
		res.locals.pageErrors.push(utils.logError("21983ue8hye", err));
		res.locals.userMessageMarkdown = `Failed to load block: **${blockHash}**`;

		res.render("block");

	}
});

router.get("/tx/:transactionId", async (req, res, next) => {
	var txid = req.params.transactionId;

	var output = -1;
	if (req.query.output) {
		output = parseInt(req.query.output);
	}

	res.locals.txid = txid;
	res.locals.output = output;

	res.locals.result = {};

	try {
		const rawTxResult = await coreApi.getRawTransactionsWithInputs([txid])
		var tx = rawTxResult.transactions[0];

		res.locals.result.getrawtransaction = tx;
		res.locals.result.txInputs = rawTxResult.txInputsByTransaction[txid]

		const finalized = await coreApi.isFinalTransaction(txid)
		res.locals.result.getrawtransaction.finalized = finalized

		var promises = [];

		promises.push(new Promise(function (resolve, reject) {
			coreApi.getTxUtxos(tx).then(function (utxos) {
				res.locals.utxos = utxos;

				resolve();

			}).catch(function (err) {
				res.locals.pageErrors.push(utils.logError("3208yhdsghssr", err));

				reject(err);
			});
		}));
		if (tx.confirmations == 0) {

			promises.push(new Promise(function (resolve, reject) {
				coreApi.getMempoolTxDetails(txid).then(function (mempoolDetails) {
					res.locals.mempoolDetails = mempoolDetails;

					resolve();

				}).catch(function (err) {
					res.locals.pageErrors.push(utils.logError("0q83hreuwgd", err));

					reject(err);
				});
			}));
		}

		if (tx.blockhash !== undefined) {
			promises.push(new Promise(function (resolve, reject) {
				coreApi.getBlockHeader(tx.blockhash).then(function (blockHeader) {
					res.locals.result.blockHeader = blockHeader;
					resolve()
				});
			}));
		}

		Promise.all(promises).then(function () {
			res.render("transaction");
			utils.perfMeasure(req);
		});

	} catch (err) {
		res.locals.userMessageMarkdown = `Failed to load transaction: txid=**${txid}**`;
		res.locals.pageErrors.push(utils.logError("1237y4ewssgt", err));

		res.render("transaction");
	};
});

router.get("/address/:address", function (req, res, next) {
	var limit = config.site.addressTxPageSize;
	var offset = 0;
	var sort = "desc";


	if (req.query.limit) {
		limit = parseInt(req.query.limit);

		// for demo sites, limit page sizes
		if (config.demoSite && limit > config.site.addressTxPageSize) {
			limit = config.site.addressTxPageSize;

			res.locals.userMessage = "Transaction page size limited to " + config.site.addressTxPageSize + ". If this is your site, you can change or disable this limit in the site config.";
		}
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}


	var address = req.params.address;

	res.locals.address = address;
	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = `/address/${address}?sort=${sort}`;
	res.locals.transactions = [];
	res.locals.addressApiSupport = addressApi.getCurrentAddressApiFeatureSupport();

	res.locals.result = {};

	try {
		res.locals.addressObj = bitcoinjs.address.fromBase58Check(address);

	} catch (err) {
		//if (!err.toString().startsWith("Error: Non-base58 character")) {
		//	res.locals.pageErrors.push(utils.logError("u3gr02gwef", err));
		//}

		try {
			res.locals.addressObj = bitcoinjs.address.fromBech32(address);

		} catch (err2) {
			//res.locals.pageErrors.push(utils.logError("u02qg02yqge", err));
			try {
				var saneAddress = "empty";
				var prefix = global.activeBlockchain == "main" ? "ecash:" : "ectest:";
				if (!address.includes(prefix)) {
					saneAddress = prefix.concat(address);
				} else {
					saneAddress = address;
				}
				res.locals.addressObj = cashaddrjs.decode(saneAddress);
				res.locals.addressObj["isCashAddr"] = true;
			} catch (err3) {
				//res.locals.pageErrors.push(utils.logError("address parsing error", err3));
			}
		}
	}

	coreApi.getAddress(address).then(function (validateaddressResult) {
		res.locals.result.validateaddress = validateaddressResult;

		var promises = [];
		if (!res.locals.crawlerBot) {
			var addrScripthash = hexEnc.stringify(sha256(hexEnc.parse(validateaddressResult.scriptPubKey)));
			addrScripthash = addrScripthash.match(/.{2}/g).reverse().join("");

			res.locals.electrumScripthash = addrScripthash;

			promises.push(new Promise(function (resolve, reject) {
				addressApi.getAddressDetails(address, validateaddressResult.scriptPubKey, sort, limit, offset).then(function (addressDetailsResult) {
					var addressDetails = addressDetailsResult.addressDetails;

					if (addressDetailsResult.errors) {
						res.locals.addressDetailsErrors = addressDetailsResult.errors;
					}

					if (addressDetails) {
						res.locals.addressDetails = addressDetails;

						if (addressDetails.balanceSat == 0) {
							// make sure zero balances pass the falsey check in the UI
							addressDetails.balanceSat = "0";
						}

						if (addressDetails.txCount == 0) {
							// make sure txCount=0 pass the falsey check in the UI
							addressDetails.txCount = "0";
						}

						if (addressDetails.txids) {
							var txids = addressDetails.txids;

							// if the active addressApi gives us blockHeightsByTxid, it saves us work, so try to use it
							var blockHeightsByTxid = {};
							if (addressDetails.blockHeightsByTxid) {
								blockHeightsByTxid = addressDetails.blockHeightsByTxid;
							}

							res.locals.txids = txids;

							coreApi.getRawTransactionsWithInputs(txids).then(function (rawTxResult) {
								res.locals.transactions = rawTxResult.transactions;
								res.locals.txInputsByTransaction = rawTxResult.txInputsByTransaction;

								// for coinbase txs, we need the block height in order to calculate subsidy to display
								var coinbaseTxs = [];
								for (var i = 0; i < rawTxResult.transactions.length; i++) {
									var tx = rawTxResult.transactions[i];

									for (var j = 0; j < tx.vin.length; j++) {
										if (tx.vin[j].coinbase) {
											// addressApi sometimes has blockHeightByTxid already available, otherwise we need to query for it
											if (!blockHeightsByTxid[tx.txid]) {
												coinbaseTxs.push(tx);
											}
										}
									}
								}


								var coinbaseTxBlockHashes = [];
								var blockHashesByTxid = {};
								coinbaseTxs.forEach(function (tx) {
									coinbaseTxBlockHashes.push(tx.blockhash);
									blockHashesByTxid[tx.txid] = tx.blockhash;
								});

								var blockHeightsPromises = [];
								if (coinbaseTxs.length > 0) {
									// we need to query some blockHeights by hash for some coinbase txs
									blockHeightsPromises.push(new Promise(function (resolve2, reject2) {
										coreApi.getBlocks(coinbaseTxBlockHashes, false).then(function (blocksByHashResult) {
											for (var txid in blockHashesByTxid) {
												if (blockHashesByTxid.hasOwnProperty(txid)) {
													blockHeightsByTxid[txid] = blocksByHashResult[blockHashesByTxid[txid]].height;
												}
											}

											resolve2();

										}).catch(function (err) {
											res.locals.pageErrors.push(utils.logError("78ewrgwetg3", err));

											reject2(err);
										});
									}));
								}

								Promise.all(blockHeightsPromises).then(function () {
									var addrGainsByTx = {};
									var addrLossesByTx = {};

									res.locals.addrGainsByTx = addrGainsByTx;
									res.locals.addrLossesByTx = addrLossesByTx;

									var handledTxids = [];

									for (var i = 0; i < rawTxResult.transactions.length; i++) {
										var tx = rawTxResult.transactions[i];
										var txInputs = rawTxResult.txInputsByTransaction[tx.txid];

										if (handledTxids.includes(tx.txid)) {
											continue;
										}

										handledTxids.push(tx.txid);

										for (var j = 0; j < tx.vout.length; j++) {
											if (tx.vout[j].value > 0 && tx.vout[j].scriptPubKey && tx.vout[j].scriptPubKey.addresses && tx.vout[j].scriptPubKey.addresses.includes(address)) {
												if (addrGainsByTx[tx.txid] == null) {
													addrGainsByTx[tx.txid] = new Decimal(0);
												}

												addrGainsByTx[tx.txid] = addrGainsByTx[tx.txid].plus(new Decimal(tx.vout[j].value));
											}
										}

										for (var j = 0; j < tx.vin.length; j++) {
											var txInput = txInputs[j];
											var vinJ = tx.vin[j];

											if (txInput != null) {
												if (txInput && txInput.scriptPubKey && txInput.scriptPubKey.addresses && txInput.scriptPubKey.addresses.includes(address)) {
													if (addrLossesByTx[tx.txid] == null) {
														addrLossesByTx[tx.txid] = new Decimal(0);
													}

													addrLossesByTx[tx.txid] = addrLossesByTx[tx.txid].plus(new Decimal(txInput.value));
												}
											}
										}

										//debugLog("tx: " + JSON.stringify(tx));
										//debugLog("txInputs: " + JSON.stringify(txInputs));
									}

									res.locals.blockHeightsByTxid = blockHeightsByTxid;

									resolve();

								}).catch(function (err) {
									res.locals.pageErrors.push(utils.logError("230wefrhg0egt3", err));

									reject(err);
								});

							}).catch(function (err) {
								res.locals.pageErrors.push(utils.logError("asdgf07uh23", err));

								reject(err);
							});

						} else {
							// no addressDetails.txids available
							resolve();
						}
					} else {
						// no addressDetails available
						resolve();
					}
				}).catch(function (err) {
					res.locals.pageErrors.push(utils.logError("23t07ug2wghefud", err));

					res.locals.addressApiError = err;

					reject(err);
				});
			}));

			promises.push(new Promise(function (resolve, reject) {
				coreApi.getBlockchainInfo().then(function (getblockchaininfo) {
					res.locals.getblockchaininfo = getblockchaininfo;

					resolve();

				}).catch(function (err) {
					res.locals.pageErrors.push(utils.logError("132r80h32rh", err));

					reject(err);
				});
			}));
		}

		promises.push(new Promise(function (resolve, reject) {
			qrcode.toDataURL(address, function (err, url) {
				if (err) {
					res.locals.pageErrors.push(utils.logError("93ygfew0ygf2gf2", err));
				}

				res.locals.addressQrCodeUrl = url;

				resolve();
			});
		}));

		Promise.all(promises.map(utils.reflectPromise)).then(function () {
			res.render("address");
			utils.perfMeasure(req);

		}).catch(function (err) {
			res.locals.pageErrors.push(utils.logError("32197rgh327g2", err));

			res.render("address");

		});

	}).catch(function (err) {
		res.locals.pageErrors.push(utils.logError("2108hs0gsdfe", err, { address: address }));

		res.locals.userMessageMarkdown = `Failed to load address: **${address}**`;

		res.render("address");
	});
});

module.exports = router;
