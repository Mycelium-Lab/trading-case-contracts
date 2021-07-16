const TokenProxy = artifacts.require('TokenProxy')
const TESTCASE_V1 = artifacts.require('TESTCASE_V1')

module.exports = (deployer, network, accounts) => {
    const [ admin, minter, proxyAdmin ] = accounts
    deployer.then(async () => {
        let tokenInstance = await deployer.deploy(TESTCASE_V1)
        const proxyInstance = await deployer.deploy(TokenProxy, tokenInstance.address, proxyAdmin, '0x')

        tokenInstance = await TESTCASE_V1.at(proxyInstance.address)
        await tokenInstance.initialize(admin, minter)
    })
}