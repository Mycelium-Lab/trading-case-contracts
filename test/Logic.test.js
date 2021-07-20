const { assert } = require("chai")
const { ether } = require("@openzeppelin/test-helpers")

const TokenProxy = artifacts.require("TokenProxy")
const CaseToken = artifacts.require("CaseToken")
const CaseStaking = artifacts.require("CaseStaking")
const CaseReward = artifacts.require("CaseReward")
const TestPancakeSwapOracle = artifacts.require("TestPancakeSwapOracle")

contract("Test Logic", function (accounts) {
  const [admin, proxyAdmin, alice, bob, sam] = accounts

  before(async () => {
    // token
    this.logicInstance = await CaseToken.new({ from: admin })
    this.proxyInstance = await TokenProxy.new(
      this.logicInstance.address,
      proxyAdmin,
      "0x"
    )
    this.tokenInstance = await CaseToken.at(this.proxyInstance.address)
    await tokenInstance.initialize(admin)

    //login
    this.testOracle = await TestPancakeSwapOracle.new()
    this.caseStaking = await CaseStaking.new(this.proxyInstance.address)
    this.caseReward = await CaseReward.new(
      admin, // market wallet
      this.caseStaking.address,
      this.proxyInstance.address,
      "0x8301f2213c0eed49a7e28ae4c3e91722919b8b47", // BUSD testnet
      this.testOracle.address
    )
    await this.caseStaking.init(this.caseReward.address)
  })

  describe("Test Staking", () => {
    it("Calling staking", async () => {
      const mintedStart = await this.caseStaking.mintedCaseTokens()
      assert.deepEqual(mintedStart.toString(), "0")

      const ia = await this.caseStaking.getInterestAmount(1000000000, 10)
      assert.deepEqual(ia.toString(), "15055027")

      // real staking
      CASE_MANAGER_STAKE_REQUIRED = 1e4 * 10 ** 8

      const tk = await this.caseStaking.caseToken()
      assert.deepEqual(tk, this.proxyInstance.address)

      const supplyBefore = await this.tokenInstance.totalSupply()

      const minter_role = await this.tokenInstance.MINTER_ROLE()
      await this.tokenInstance.grantRole(
        minter_role,
        this.caseStaking.address,
        { from: admin }
      )

      await this.tokenInstance.mint(alice, CASE_MANAGER_STAKE_REQUIRED, {
        from: admin,
      })
      const balanceAlice = await this.tokenInstance.balanceOf(alice)

      await this.tokenInstance.approve(
        this.caseStaking.address,
        CASE_MANAGER_STAKE_REQUIRED,
        {
          from: alice,
        }
      )

      console.log("alice", balanceAlice.toString())

      await this.caseStaking.stake(CASE_MANAGER_STAKE_REQUIRED, 10, admin, {
        from: alice,
      })

      const supplyAfter = await this.tokenInstance.totalSupply()
      console.log(supplyBefore.toString(), supplyAfter.toString())

      const minted = await this.caseStaking.mintedCaseTokens()
      console.log(minted.toString())

      const f = () =>
        new Promise((resolve) => {
          setTimeout(async () => {
            await this.caseStaking.withdraw(0, { from: alice })
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
      const errorMsg = "CaseReward: unauthorized signer call!"
      ;(async () => {
        let err = ""
        try {
          await this.caseReward.refer(bob, sam)
        } catch (error) {
          err = error.reason
        }
        assert.deepEqual(err, errorMsg)
      })()
      ;(async () => {
        let err = ""
        try {
          await this.caseReward.refer(bob, sam, { from: admin })
        } catch (error) {
          err = error.reason
        }
        assert.deepEqual(err, errorMsg)
      })()
      ;(async () => {
        let err = ""
        try {
          await this.caseReward.refer(bob, sam, { from: admin })
        } catch (error) {
          err = error.reason
        }
        assert.deepEqual(err, errorMsg)
      })()
    })

    it("Calling rank up with no cv", async () => {
      const errorMsg = "CaseReward: career value is not enough!"
      ;(async () => {
        let err = ""
        try {
          await this.caseReward.rankUp(bob, { from: bob })
        } catch (error) {
          err = error.reason
        }
        assert.deepEqual(err, errorMsg)
      })()
      ;(async () => {
        let err = ""
        try {
          await this.caseReward.rankUp(alice, { from: alice })
        } catch (error) {
          err = error.reason
        }
        assert.deepEqual(err, errorMsg)
      })()
    })

    it("Calling reward", async () => {
      const canRefer = await this.caseReward.canRefer(bob, sam)
      console.log(canRefer)
      const caseToken = await this.caseReward.caseToken()
      console.log(caseToken)
      const mintedReward = await this.caseReward.mintedCaseTokens()
      console.log(mintedReward.toString())
      const cvRankOf = await this.caseReward.cvRankOf(alice)
      console.log(cvRankOf.toString())
    })
  })
})
