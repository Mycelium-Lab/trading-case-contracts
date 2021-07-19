const { assert } = require("chai")
const { ether } = require("@openzeppelin/test-helpers")

const TokenProxy = artifacts.require("TokenProxy")
const TESTCASE_V1 = artifacts.require("TESTCASE_V1")
const TestStaking = artifacts.require("TestStaking")
const TestReward = artifacts.require("TestReward")
const TestPancakeSwapOracle = artifacts.require("TestPancakeSwapOracle")

contract("Test Logic", function (accounts) {
  const [admin, proxyAdmin, alice, bob, sam] = accounts

  before(async () => {
    // token
    this.logicInstance = await TESTCASE_V1.new({ from: admin })
    this.proxyInstance = await TokenProxy.new(
      this.logicInstance.address,
      proxyAdmin,
      "0x"
    )
    this.tokenInstance = await TESTCASE_V1.at(this.proxyInstance.address)
    await tokenInstance.initialize(admin)

    //login
    this.testOracle = await TestPancakeSwapOracle.new()
    this.testStaking = await TestStaking.new(this.proxyInstance.address)
    this.testReward = await TestReward.new(
      admin, // market wallet
      this.testStaking.address,
      this.proxyInstance.address,
      "0x8301f2213c0eed49a7e28ae4c3e91722919b8b47", // BUSD testnet
      this.testOracle.address
    )
    await this.testStaking.init(this.testReward.address)
  })

  describe("Test Staking", () => {
    it("Calling staking", async () => {
      const mintedStart = await this.testStaking.mintedPeakTokens()
      assert.deepEqual(mintedStart.toString(), "0")

      const ia = await this.testStaking.getInterestAmount(1000000000, 10)
      assert.deepEqual(ia.toString(), "15055027")

      // real staking
      PEAK_MANAGER_STAKE_REQUIRED = 1e4 * 10 ** 8

      const tk = await this.testStaking.peakToken()
      assert.deepEqual(tk, this.proxyInstance.address)

      const supplyBefore = await this.tokenInstance.totalSupply()

      const minter_role = await this.tokenInstance.MINTER_ROLE()
      await this.tokenInstance.grantRole(
        minter_role,
        this.testStaking.address,
        { from: admin }
      )

      await this.tokenInstance.mint(alice, PEAK_MANAGER_STAKE_REQUIRED, {
        from: admin,
      })
      const balanceAlice = await this.tokenInstance.balanceOf(alice)

      await this.tokenInstance.approve(
        this.testStaking.address,
        PEAK_MANAGER_STAKE_REQUIRED,
        {
          from: alice,
        }
      )

      console.log("alice", balanceAlice.toString())

      await this.testStaking.stake(PEAK_MANAGER_STAKE_REQUIRED, 10, admin, {
        from: alice,
      })

      const supplyAfter = await this.tokenInstance.totalSupply()
      console.log(supplyBefore.toString(), supplyAfter.toString())

      const minted = await this.testStaking.mintedPeakTokens()
      console.log(minted.toString())

      const f = () =>
        new Promise((resolve) => {
          setTimeout(async () => {
            await this.testStaking.withdraw(0, { from: alice })
            const balanceAliceAfterWithdrawal =
              await this.tokenInstance.balanceOf(alice)
            console.log(balanceAliceAfterWithdrawal.toString())
            resolve()
          }, 10 * 1000)
        })

      await f()
    })
  })

  describe("Test reward", () => {
    it("Calling refer from outside Staking", async () => {
      const errorMsg = "PeakReward: unauthorized signer call!"
      ;(async () => {
        let err = ""
        try {
          await this.testReward.refer(bob, sam)
        } catch (error) {
          err = error.reason
        }
        assert.deepEqual(err, errorMsg)
      })()
      ;(async () => {
        let err = ""
        try {
          await this.testReward.refer(bob, sam, { from: admin })
        } catch (error) {
          err = error.reason
        }
        assert.deepEqual(err, errorMsg)
      })()
      ;(async () => {
        let err = ""
        try {
          await this.testReward.refer(bob, sam, { from: admin })
        } catch (error) {
          err = error.reason
        }
        assert.deepEqual(err, errorMsg)
      })()
    })

    it("Calling rank up with no cv", async () => {
      const errorMsg = "PeakReward: career value is not enough!"
      ;(async () => {
        let err = ""
        try {
          await this.testReward.rankUp(bob, { from: bob })
        } catch (error) {
          err = error.reason
        }
        assert.deepEqual(err, errorMsg)
      })()
      ;(async () => {
        let err = ""
        try {
          await this.testReward.rankUp(alice, { from: alice })
        } catch (error) {
          err = error.reason
        }
        assert.deepEqual(err, errorMsg)
      })()
    })

    it("Calling reward", async () => {
      const canRefer = await this.testReward.canRefer(bob, sam)
      console.log(canRefer)
      const peakToken = await this.testReward.peakToken()
      console.log(peakToken)
      const mintedReward = await this.testReward.mintedPeakTokens()
      console.log(mintedReward.toString())
      const cvRankOf = await this.testReward.cvRankOf(alice)
      console.log(cvRankOf.toString())
    })
  })
})
