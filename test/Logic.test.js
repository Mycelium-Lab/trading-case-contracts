const { assert } = require("chai")
const { ether } = require("@openzeppelin/test-helpers")
const BigNumber = require("bignumber.js")

const TokenProxy = artifacts.require("TokenProxy")
const CaseToken = artifacts.require("CaseToken")
const CaseStaking = artifacts.require("CaseStaking")
const CaseReward = artifacts.require("CaseReward")

contract("Test Logic", function (accounts) {
  const [admin, proxyAdmin, alice, john, jack, bob, sam, kyle, dale, homer, harry, james, george, edward, ryan, eric, tom, ben, jen, ken] = accounts

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

    this.setupTokensForStaking = async (give_to, amount) => {
      await this.tokenInstance.mint(give_to, amount, {
        from: admin
      })

      await this.tokenInstance.approve(
        this.caseStaking.address,
        amount,
        { from: give_to }
      )
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
      await this.setupTokensForStaking(alice, this.CASE_10000)

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
      
      await this.setupTokensForStaking(john, this.bnToString(stakeAmount))
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
    // only for testing onlySigner functions if DEFAULT_ADMIN role is specified as admin is CaseReward constructor
    // before(async () => {
    //   const signer_role = await this.caseReward.SIGNER_ROLE()
    //   await this.caseReward.grantRole(signer_role, admin, {
    //     from: admin
    //   })
    // })

    it("Calling refer from outside Staking", async () => {
      const errorMsg = "CaseReward: unauthorized signer call!"
      ;(async () => {
        let err = ""
        try {
          await this.caseReward.refer(bob, sam, { from: sam })
        } catch (error) {
          err = error.reason
        }
        assert.deepEqual(err, errorMsg)
      })()
      ;(async () => {
        let err = ""
        try {
          await this.caseReward.refer(bob, sam, { from: bob })
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

    it("Check rank of Bob", async () => {
      const cvRankOfBob = await this.caseReward.cvRankOf(bob)
      assert.deepEqual(cvRankOfBob.toString(), "0")
    })

    it("Check must be only one referrer", async () => {
      // give tokens to bob
      await this.setupTokensForStaking(bob, this.CASE_10000)
      
      const initJackBalance = await this.tokenInstance.balanceOf(jack)
      const initAliceBalance = await this.tokenInstance.balanceOf(alice)
      const stakeForDays = 100
      // refer is called within staking
      await this.caseStaking.stake(
        this.CASE_10000 / 2,
        stakeForDays,
        jack,
        { from: bob }
      )
      
      await this.caseStaking.stake(
        this.CASE_10000 / 2,
        stakeForDays,
        alice,
        { from: bob }
      )

      const afterReferJackBalance = await this.tokenInstance.balanceOf(jack)
      const afterReferAliceBalance = await this.tokenInstance.balanceOf(alice)
      
      // since alice cannot be the second referrer, her balance must remain unchanged
      assert.notDeepEqual(initJackBalance, afterReferJackBalance)
      assert.deepEqual(initAliceBalance, afterReferAliceBalance)

      const actualReferrer = await this.caseReward.referrerOf(bob)
      assert.deepEqual(actualReferrer, jack, 'referrer not set correctly')
    })

    it("Check paying commission", async () => {
      // give tokens to sam, kyle and dale
      await this.setupTokensForStaking(sam, this.CASE_10000)
      await this.setupTokensForStaking(kyle, this.CASE_10000)
      await this.setupTokensForStaking(dale, this.CASE_10000)
      await this.setupTokensForStaking(homer, this.CASE_10000)

      const stakeForDays = 100

      // dale has enough stake for all 8 levels, we will test the first two 
      // (8 and 5 % correspondingly)
      await this.caseStaking.stake(
        this.CASE_10000,
        stakeForDays,
        this.ZERO_ADDR,
        { from: dale }
      )

      await this.caseStaking.stake(
        this.CASE_10000,
        stakeForDays,
        dale,
        { from: sam }
      )

      await this.caseStaking.stake(
        this.CASE_10000,
        stakeForDays,
        sam,
        { from: kyle }
      )

      await this.caseStaking.stake(
        this.CASE_10000,
        stakeForDays,
        kyle,
        { from: homer }
      )

      const expectedInterest = BigNumber((await this.caseStaking.getInterestAmount(this.CASE_10000, stakeForDays))) 
      
      const afterReferralsKyleBalance = BigNumber((await this.tokenInstance.balanceOf(kyle)))
      const afterReferralsSamBalance = BigNumber((await this.tokenInstance.balanceOf(sam)))
      const afterReferralsDaleBalance = BigNumber((await this.tokenInstance.balanceOf(dale)))

      // 0.03 is a referred bonus
      assert(epsilon_equal(afterReferralsKyleBalance, expectedInterest * (0.08 + 0.03)), 'referral levels balance distribution incorrect')
      assert(epsilon_equal(afterReferralsSamBalance, expectedInterest * (0.08 + 0.05 + 0.03)), 'referral levels balance distribution incorrect')
      // date has no referred bonus
      assert(epsilon_equal(afterReferralsDaleBalance, expectedInterest * (0.08 + 0.05 + 0.025)), 'referral levels balance distribution incorrect')
    })

    it('Check CV points/rank', async () => {
      const stakeForDays = 100
      const expectedInterest = BigNumber((await this.caseStaking.getInterestAmount(this.CASE_10000, stakeForDays))) 

      const initCareerValueOfDale = BigNumber((await this.caseReward.careerValue(dale)))
      const initCareerRankOfDale = await this.caseReward.cvRankOf(dale)

      assert(this.epsilon_equal(initCareerValueOfDale, expectedInterest * (0.08 + 0.05 + 0.025)), 'career points distribution incorrect')
      assert.deepEqual(initCareerRankOfDale.toNumber(), 1, 'career rank is set incorrectly')

      const largeStake = this.CASE_10000 * 100
      const expectedInterestLarge = BigNumber((await this.caseStaking.getInterestAmount(largeStake, stakeForDays))) 

      await this.setupTokensForStaking(harry, largeStake)
      await this.caseStaking.stake(
        largeStake,
        stakeForDays,
        dale,
        { from: harry }
      )

      const afterCareerValueOfDale = BigNumber((await this.caseReward.careerValue(dale)))
      const afterCareerRankOfDale = await this.caseReward.cvRankOf(dale)

      assert(this.epsilon_equal(afterCareerValueOfDale, BigNumber(expectedInterest * (0.08 + 0.05 + 0.025)).plus(BigNumber(expectedInterestLarge * 0.08))), 'career points distribution incorrect')
      // dale should have appx. 14836,5 points, 10000 < 20000 - rank 5
      assert.deepEqual(afterCareerRankOfDale.toNumber(), 5, 'career rank is set incorrectly')
    })

    it('Check rank up and rewards', async () => {
      const initDaleBalance = BigNumber((await this.tokenInstance.balanceOf(dale)))
      const initDaleRank = await this.caseReward.rankOf(dale)
      assert.deepEqual(initDaleRank.toNumber(), 0)

      await this.caseReward.rankUp(dale)
      const afterBalance = BigNumber((await this.tokenInstance.balanceOf(dale)))
      const afterDaleRank = await this.caseReward.rankOf(dale)

      assert.deepEqual(afterDaleRank.toNumber(), 1, 'rank setting incorrect')
      // dale received a rank reward of 1000 for 0->1
      assert(this.epsilon_equal(afterBalance.minus(initDaleBalance), BigNumber(this.CASE_1000)), 'rank reward distribution incorrect')

      // fresh new test with james & george, edward, ryan, eric
      // the goal is james reaching rank 2
      // ryan and eric are needed only for increasing james' cv points
      const names = [james, george, edward, ryan, eric]

      const stakeForDays = 100
      const bigStakeAmount = this.CASE_10000 * 10
      for (const name of names) {
        await this.setupTokensForStaking(name, bigStakeAmount)
      }

      for (const name of names) {
        let ref = james
        if (name === james) {
          ref = this.ZERO_ADDR
        } 
        await this.caseStaking.stake(
          bigStakeAmount,
          stakeForDays,
          ref,
          { from: name }
        )
      }

      // give james's referrals two referrals each
      const subNames = [tom, ben, jen, ken]
      for (const name of subNames) {
        await this.setupTokensForStaking(name, bigStakeAmount)
      }

      for (const name of subNames.slice(0, 2)) {
        await this.caseStaking.stake(
          bigStakeAmount,
          stakeForDays,
          george,
          { from: name }
        )
      }

      for (const name of subNames.slice(-2)) {
        await this.caseStaking.stake(
          bigStakeAmount,
          stakeForDays,
          edward,
          { from: name }
        )
      }

      // increase downline ranks [1] of james to 2
      await this.caseReward.rankUp(george)
      await this.caseReward.rankUp(edward)

      const initJamesBalance = BigNumber((await this.tokenInstance.balanceOf(james)))
      const initJamesRank = await this.caseReward.rankOf(james) 

      assert.deepEqual(initJamesRank.toNumber(), 0)

      // rank up james 2 times to rank 2
      await this.caseReward.rankUp(james)
      await this.caseReward.rankUp(james)

      const afterRankUpJamesBalance = BigNumber((await this.tokenInstance.balanceOf(james)))
      const afterRankUpJamesRank = await this.caseReward.rankOf(james) 

      assert.deepEqual(afterRankUpJamesRank.toNumber(), 2, 'rank setting incorrect')
      // james receives 1000 for reaching rank 1, 5000 for reaching rank 2
      assert(this.epsilon_equal(afterRankUpJamesBalance.minus(initJamesBalance), BigNumber(this.CASE_1000).plus(BigNumber(this.CASE_1000 * 5))), 'rank reward distribution incorrect')

      // trying to rank up james again
      ;(async () => {
        let hasErr = false
        try {
          await this.caseReward.rankUp(james)
        } catch {
          hasErr = true
        }
        assert.deepEqual(hasErr, true, 'ranking up when conditions not satisfied')
      })()
    })
  })
})