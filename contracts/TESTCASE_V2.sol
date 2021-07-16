pragma solidity ^0.6.2;

import "./TESTCASE_V1.sol";

// MOCK TOKEN FOR UNIT TESTING
contract TESTCASE_V2 is TESTCASE_V1 {
    function changeTokenData(
        string calldata newName,
        string calldata symbol,
        uint8 newDecimal
    ) external {
        _initialize(newName, symbol, newDecimal);
    }
}
