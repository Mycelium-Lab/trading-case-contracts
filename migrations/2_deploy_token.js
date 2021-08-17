const CaseToken = artifacts.require("CaseToken")
const TokenProxy = artifacts.require("TokenProxy")

module.exports = (deployer, network, accounts) => {
  const [admin, proxyAdmin] = accounts
  deployer.then(async () => {
    const tokenInstance = await deployer.deploy(CaseToken)
    const proxyInstance = await deployer.deploy(
      TokenProxy,
      tokenInstance.address,
      proxyAdmin,
      "0x"
    )

    const tokenBoundToProxy = await CaseToken.at(proxyInstance.address)
    await tokenBoundToProxy.initialize(admin)
  })
}
