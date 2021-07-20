const TokenProxy = artifacts.require("TokenProxy")
const CaseToken = artifacts.require("CaseToken")

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
  })
}
