const TokenProxy = artifacts.require("TokenProxy")
const CaseToken = artifacts.require("CaseToken")
const CaseStaking = artifacts.require("CaseStaking")
const CaseReward = artifacts.require("CaseReward")
const TestPancakeSwapOracle = artifacts.require("TestPancakeSwapOracle")

module.exports = (deployer, network, accounts) => {
  const [admin, proxyAdmin] = accounts
  deployer.then(async () => {
    let tokenInstance = await deployer.deploy(CaseToken)
    const proxyInstance = await deployer.deploy(
      TokenProxy,
      tokenInstance.address,
      proxyAdmin,
      "0x"
    )

    tokenInstance = await CaseToken.at(proxyInstance.address)
    await tokenInstance.initialize(admin)
    
    // logic
    const testOracle = await deployer.deploy(TestPancakeSwapOracle)
    const caseStaking = await deployer.deploy(CaseStaking, proxyInstance.address)
    const caseReward = await deployer.deploy(
      CaseReward,
      admin, // admin wallet acts as a market wallet
      caseStaking.address,
      proxyInstance.address,
      "0xf3e0d7bf58c5d455d31ef1c2d5375904df525105", // USDT testnet, dummy address
      testOracle.address
    )

    await caseStaking.init(caseReward.address)
    const minter_role = await tokenInstance.MINTER_ROLE()
    await tokenInstance.grantRole(minter_role, caseStaking.address, {
      from: admin,
    })
  })
}
