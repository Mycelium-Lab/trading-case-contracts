const { assert } = require("chai")
const { ether } = require("@openzeppelin/test-helpers")
const BigNumber = require("bignumber.js")

const TokenProxy = artifacts.require("TokenProxy")
const CaseToken = artifacts.require("CaseToken")
const CaseStaking = artifacts.require("CaseStaking")
const CaseReward = artifacts.require("CaseReward")

contract("Test Logic", function (accounts) {
  const [admin, proxyAdmin, alice, bob, sam, john, jack] = accounts

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

    // logic
    this.caseStaking = await CaseStaking.new(this.proxyInstance.address)
    this.caseReward = await CaseReward.new(
      admin, // admin wallet acts as a market wallet
      this.caseStaking.address,
      this.proxyInstance.address,
    )

    await this.caseStaking.init(this.caseReward.address)
    const minter_role = await this.tokenInstance.MINTER_ROLE()
    await this.tokenInstance.grantRole(minter_role, this.caseStaking.address, {
      from: admin,
    })
    await tokenInstance.grantRole(minter_role, this.caseReward.address, {
      from: admin,
    })

    // extras
    this.timeTravel = function (time) {
      return new Promise(function (resolve, reject) {
        return web3.currentProvider.send(
          {
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [time],
            id: new Date().getTime(),
          },
          function (err, result) {
            if (err) {
              return reject(err)
            }
            return resolve(result)
          }
        )
      })
    }

    this.bnToString = function(bn) {
      return BigNumber(bn).toFixed(0)
    }

    this.epsilon = () => 1e-3

    this.epsilon_equal = function(curr, prev) {
      return BigNumber(curr).eq(prev) || BigNumber(curr).minus(prev).div(prev).abs().lt(this.epsilon())
    }

    this.CASE_PRECISION = 10 ** 8
    this.CASE_10 = 1e1 * this.CASE_PRECISION
    this.CASE_100 = 1e2 * this.CASE_PRECISION
    this.CASE_1000 = 1e3 * this.CASE_PRECISION
    this.CASE_10000 = 1e4 * this.CASE_PRECISION
    this.ZERO_ADDR = "0x0000000000000000000000000000000000000000"
    this.SECONDS_IN_DAY = 86400
  })

  describe("Test Staking", () => {
    it("Check initially minted", async () => {
      // check 0 minted at the start
      const mintedStart = await this.caseStaking.mintedCaseTokens()
      assert.deepEqual(mintedStart.toString(), "0")
    })

    it("Check interest amount", async () => {
      // interest amount
      const ia = await this.caseStaking.getInterestAmount(1000000000, 10)
      assert.deepEqual(ia.toString(), "15055027")

      const ia2 = await this.caseStaking.getInterestAmount(this.CASE_10000, 10)
      assert.deepEqual(ia2.toString(), "15082397260")
    })

    it("Check token matches proxy", async () => {
      // test token
      const token = await this.caseStaking.caseToken()
      assert.deepEqual(token, this.proxyInstance.address)
    })

    it("Check staking without a referrer", async () => {
      // prepare for staking
      const supplyBefore = await this.tokenInstance.totalSupply()

      // mint tokens to alice for staking
      await this.tokenInstance.mint(alice, this.CASE_10000, {
        from: admin,
      })
      await this.tokenInstance.approve(
        this.caseStaking.address,
        this.CASE_10000,
        { from: alice }
      )
      const initBalanceAlice = await this.tokenInstance.balanceOf(alice)
      assert.deepEqual(initBalanceAlice.toString(), "1000000000000")

      // actual staking
      const stakeForDays = 100
      await this.caseStaking.stake(
        this.CASE_10000,
        stakeForDays,
        this.ZERO_ADDR,
        { from: alice }
      )

      const supplyAfter = await this.tokenInstance.totalSupply()
      assert.deepEqual(supplyBefore.toString(), "0")
      assert.deepEqual(supplyAfter.toString(), "1155323972602")

      const minted = await this.caseStaking.mintedCaseTokens()
      assert.deepEqual(minted.toString(), "155323972602")
      
      await this.timeTravel(this.SECONDS_IN_DAY * stakeForDays)
      await this.caseStaking.withdraw(0, { from: alice })
      const balanceAliceAfterWithdrawal = await this.tokenInstance.balanceOf(
        alice
      )
      assert.deepEqual(balanceAliceAfterWithdrawal.toString(), "1155323972602")

      // MANUALLY
      // const manualWithdrawAfter = () =>
      //   new Promise((resolve) => {
      //     setTimeout(async () => {
      //       await this.caseStaking.withdraw(0, { from: alice })
      //       const balanceAliceAfterWithdrawal =
      //         await this.tokenInstance.balanceOf(alice)
      //       console.log(balanceAliceAfterWithdrawal.toString())
      //       resolve()
      //     }, 10 * 1000)
      //   })
      // await manualWithdrawAfter()
    })

    it("Check staking with a referrer", async () => {
      const stakeForDays = 100
      const stakeAmount = this.CASE_10
      
      await this.tokenInstance.mint(john, this.bnToString(stakeAmount), { from: admin })
      await this.tokenInstance.approve(this.caseStaking.address, this.bnToString(stakeAmount), { from: john })
      await this.caseStaking.stake(this.bnToString(stakeAmount), stakeForDays, jack, { from: john })

      const balance0 = BigNumber((await this.tokenInstance.balanceOf(john)))
      const balance1 = BigNumber((await this.tokenInstance.balanceOf(jack)))

      const expectedInterest = BigNumber((await this.caseStaking.getInterestAmount(this.bnToString(stakeAmount), stakeForDays)))
      const expectedReward0 = BigNumber(expectedInterest).times(0.03) // 3% bonus for the referred
      const expectedReward1 = BigNumber(expectedInterest).times(0.08) // first level 8% bonus for the referrer

      assert(epsilon_equal(expectedReward0, balance0), "Staker reward incorrect.")
      assert(epsilon_equal(expectedReward1, balance1), "Referrer reward incorrect.")

      // withdrawing stake #1 (alice was 0)
      await this.timeTravel(stakeForDays * this.SECONDS_IN_DAY)

      const beforeBalanceA = (await this.tokenInstance.balanceOf(john))
      await this.caseStaking.withdraw(1, { from: john })
      const balanceChangeA = BigNumber((await this.tokenInstance.balanceOf(john))).minus(beforeBalanceA)
      const expectedInterestA = BigNumber((await this.caseStaking.getInterestAmount(bnToString(stakeAmount), stakeForDays)))
      const actualInterestA = balanceChangeA.minus(stakeAmount)
      
      assert(epsilon_equal(actualInterestA, expectedInterestA), "Interest amount incorrect for stake #1")
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

    it("Calling canRefer", async () => {
      const canRefer = await this.caseReward.canRefer(bob, sam)
      assert.deepEqual(canRefer, true)
    })

    it("Check token matches proxy", async () => {
      // test token
      const token = await this.caseReward.caseToken()
      assert.deepEqual(token, this.proxyInstance.address)
    })

    it("Check initially minted", async () => {
      // check 0 minted at the start
      const mintedStart = await this.caseReward.mintedCaseTokens()
      assert.deepEqual(mintedStart.toString(), "0")
    })

    it("Check rank of Alice", async () => {
      const cvRankOfAlice = await this.caseReward.cvRankOf(alice)
      assert.deepEqual(cvRankOfAlice.toString(), "0")
    })
  })
})