pragma solidity ^0.6.2;

contract TestPancakeSwapOracle {
    function update() external pure returns (bool success) {
        return true;
    }

    function consult(address token, uint256 amountIn)
        external
        pure
        returns (uint256 amountOut)
    {
        return 12 * 10**16; // 1 TEST = 0.12 USDC
    }
}
