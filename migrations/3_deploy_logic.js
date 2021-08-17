const CaseToken = artifacts.require("CaseToken")
const TokenProxy = artifacts.require("TokenProxy")
const CaseStaking = artifacts.require("CaseStaking")
const CaseReward = artifacts.require("CaseReward")

module.exports = (deployer, network, accounts) => {
  const [admin] = accounts
  deployer.then(async () => { 
    const proxyInstance = await TokenProxy.deployed()
    const tokenInstance = await CaseToken.at(proxyInstance.address)
  
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
