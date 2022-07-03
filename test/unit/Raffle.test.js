const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
	? describe.skip
	: describe("Raffle Unit Tests", async function () {
		let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval;
		const chainId = network.config.chainId;

		beforeEach(async function () {
			accounts = await ethers.getSigners()
			deployer = (await getNamedAccounts()).deployer;
			player = accounts[1];
			await deployments.fixture(["all"]);
			raffle = await ethers.getContract("Raffle", deployer);
			vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
			raffleEntranceFee = await raffle.getEntranceFee();
			interval = await raffle.getInterval();
		})

		describe("cosntructor", function() {
			it("initializes the raffle correctly", async function () {
				const raffleState = await raffle.getRaffleState();
				const interval = await raffle.getInterval();
				assert.equal(raffleState.toString(), "0");
				assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
			})
		})

		describe("enterRaffle", function() {
			it("revert when you don't pay enough", async function () {
				await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__NotEnoughETHEntered");
			})

			it("records player when they enter", async function () {
				await raffle.enterRaffle({ value: raffleEntranceFee });
				const playerFromContract = await raffle.getPlayer(0);
				assert.equal(playerFromContract, deployer);
			})

			it("emits event on enter", async function () {
				await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
					raffle, "RaffleEnter"
				);
			})

			it("Doesn't allow entrance when raffle is calculating", async function () {
				await raffle.enterRaffle({ value: raffleEntranceFee });
				await network.provider.send("evm_increaseTime", [interval.toNumber()+1]);
				await network.provider.send("evm_mine", []);
				await raffle.performUpkeep([]);
				await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
					"Raffle__NotOpen"
				);
			})
		})

		describe("checkUpkeep", function () {
			it("returns false if people haven't send any ETH", async function () {
				await network.provider.send("evm_increaseTime", [interval.toNumber()+1]);
				await network.provider.send("evm_mine", []);
				const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
				assert(!upkeepNeeded);
			})

			it("returns false if raffle isn't open", async function () {
				await raffle.enterRaffle({ value: raffleEntranceFee });
				await network.provider.send("evm_increaseTime", [interval.toNumber()+1]);
				await network.provider.send("evm_mine", []);
				await raffle.performUpkeep([]);
				const raffleState = await raffle.getRaffleState();
				const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
				assert.equal( raffleState.toString(), "1");
				assert.equal(upkeepNeeded, false);
			})
		})

		describe("performUpkeep", function () {
			it("it can only run if checkupkeep is true", async function () {
				await raffle.enterRaffle({ value: raffleEntranceFee });
				await network.provider.send("evm_increaseTime", [interval.toNumber()+1]);
				await network.provider.send("evm_mine", []);
				const tx = await raffle.performUpkeep([]);
				assert(tx);
			})

			it("reverts when checkUpkeep is false", async function () {
				await expect(raffle.performUpkeep([])).to.be.revertedWith(
					"Raffle__UpkeepNotNeeded"
				)
			})

			it("updated the raffle state, emits an event and calls the vrf coordinator", async function () {
				await raffle.enterRaffle({ value: raffleEntranceFee });
				await network.provider.send("evm_increaseTime", [interval.toNumber()+1]);
				await network.provider.send("evm_mine", []);
				const txResponse = await raffle.performUpkeep([]);
				const txReciept = await txResponse.wait(1);
				const requestId = txReciept.events[1].args.requestId;
				const raffleState = await raffle.getRaffleState();
				assert(requestId.toNumber() > 0);
				assert(raffleState.toString() == "1");
			})
		})

		describe("fulfillRandomWords", function () {
			beforeEach(async function () {
				await raffle.enterRaffle({ value: raffleEntranceFee });
				await network.provider.send("evm_increaseTime", [interval.toNumber()+1]);
				await network.provider.send("evm_mine", []);
			})

			it("Can only be called after performUpkeep", async function () {
				await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address))
					.to.be.revertedWith("nonexistent request");
			})

			it("picks a winner, resets, and sends money", async () => {
          		const additionalEntrances = 3;
	            const startingAccountIndex = 1;
	            const accounts = await ethers.getSigners();
	            for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrances; i++) {
	                const accountConnectedrRaffle = raffle.connect(accounts[i]);
	                await accountConnectedrRaffle.enterRaffle({ value: raffleEntranceFee });
	            }
	            const startingTimeStamp = await raffle.getLatestTimeStamp()

	            // This will be more important for our staging tests...
	            await new Promise(async (resolve, reject) => {
	                raffle.once("WinnerPicked", async () => {
	                    console.log("Found the event!");
	                    try {
	                        const recentWinner = await raffle.getRecentWinner();
	                        const raffleState = await raffle.getRaffleState();
	                        const endingTimeStamp = await raffle.getLatestTimeStamp();
	                        const numPlayers = await raffle.getNumberOfPlayers();
	                        const winnerEndingBalance = await accounts[1].getBalance();
	                        assert.equal(numPlayers.toString(), "0");
	                        assert.equal(raffleState.toString(), "0");
	                        assert(endingTimeStamp > startingTimeStamp);
	                        assert.equal(
	                            winnerEndingBalance.toString(),
	                            winnerStartingBalance.add(
                                    raffleEntranceFee
                                        .mul(additionalEntrances)
                                        .add(raffleEntranceFee)
                                )
	                                .toString()
	                        )
	                    } catch (e) {
	                        reject(e);
	                    }
	                    resolve();
	                })

	                const tx = await raffle.performUpkeep([]);
	                const txReciept = await tx.wait(1);
	                const winnerStartingBalance = await accounts[1].getBalance();
	                await vrfCoordinatorV2Mock.fulfillRandomWords(
	                	txReciept.events[1].args.requestId,
	                	raffle.address
	                );
	            })
            })
		})
	})