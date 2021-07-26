const TokenProxy = artifacts.require("TokenProxy")
const CaseToken = artifacts.require("CaseToken")
const CaseStaking = artifacts.require("CaseStaking")
const CaseReward = artifacts.require("CaseReward")

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
    const caseStaking = await deployer.deploy(CaseStaking, proxyInstance.address)
    const caseReward = await deployer.deploy(
      CaseReward,
      admin, // admin wallet acts as a market wallet
      caseStaking.address,
      proxyInstance.address,
    )

    await caseStaking.init(caseReward.address)
    const minter_role = await tokenInstance.MINTER_ROLE()
    await tokenInstance.grantRole(minter_role, caseStaking.address, {
      from: admin,
    })
    await tokenInstance.grantRole(minter_role, caseReward.address, {
      from: admin,
    })
  })
}
