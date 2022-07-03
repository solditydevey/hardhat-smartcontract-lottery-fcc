const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
	? describe.skip
	: describe("Raffle Unit Tests", async function () {
		let raffle, raffleEntranceFee, deployer;
		const chainId = network.config.chainId;

		beforeEach(async function () {
			deployer = (await getNamedAccounts()).deployer;
			raffle = await ethers.getContract("Raffle", deployer);
			raffleEntranceFee = await raffle.getEntranceFee();
		})

		describe("fulfillRandomWords", function () {
			it("works with live Chainlink Keepers and Chainlink VRF, we got a random winner", async function () {
				const startingTimeStamp = await raffle.getLatestTimeStamp();
				const accounts = await ethers.getSigners();

				await new Promise(async (resolve, reject) => {
					raffle.once("WinnerPicked", async () => {
						console.log("WinnerPicked event fired!");
						resolve();
						try {
							const recentWinner = await raffle.getRecentWinner();
							const raffleState = await raffle.getRaffleState();
							const winnerEndingBalance = await accounts[0].getBalance();
							const endingTimeStamp = await raffle.getLatestTimeStamp();

							await expect(raffle.getPlayer(0)).to.be.reverted;
							assert.equal(recentWinner.toString(), accounts[0].address);
							assert.equal(raffleState, 0);
							assert.equal(winnerEndingBalance.toString(), 
								winnerStartingBalance.add(raffleEntranceFee).toString());
							assert(endingTimeStamp > startingTimeStamp);
						} catch(error) {
							console.log(error);
							reject(error);
						}
					})

					await raffle.enterRaffle({ value: raffleEntranceFee });
					const winnerStartingBalance = await account[0].getBalance();
				})
			})
		})
	})