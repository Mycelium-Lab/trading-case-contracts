pragma solidity ^0.6.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./IPancakeSwapOracle.sol";
import "./TESTCASE_V1.sol";
import "./TestStaking.sol";

contract TestReward is AccessControl {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event Register(address user, address referrer);
    event RankChange(address user, uint256 oldRank, uint256 newRank);
    event PayCommission(
        address referrer,
        address recipient,
        address token,
        uint256 amount,
        uint8 level
    );
    event ChangedCareerValue(address user, uint256 changeAmount, bool positive);
    event ReceiveRankReward(address user, uint256 peakReward);

    modifier regUser(address user) {
        if (!isUser[user]) {
            isUser[user] = true;
            emit Register(user, address(0));
        }
        _;
    }

    modifier onlySigner() {
        require(hasRole(SIGNER_ROLE, _msgSender()), "PeakReward: unauthorized signer call!");
        _;
    }

    uint256 internal constant COMMISSION_RATE = 20 * (10**16); // 20%
    uint256 internal constant PEAK_PRECISION = 10**8;
    uint256 public constant PEAK_MINT_CAP = 25000000 * PEAK_PRECISION; // 25 million PEAK
    uint256 internal constant BUSD_PRECISION = 10**18;
    uint8 internal constant COMMISSION_LEVELS = 8;

    mapping(address => address) public referrerOf;
    mapping(address => bool) public isUser;
    mapping(address => uint256) public careerValue; // AKA DSV
    mapping(address => uint256) public rankOf;
    mapping(uint256 => mapping(uint256 => uint256)) public rankReward; // (beforeRank, afterRank) => rewardInPeak
    mapping(address => mapping(uint256 => uint256)) public downlineRanks; // (referrer, rank) => numReferredUsersWithRank

    uint256[] public commissionPercentages;
    uint256[] public commissionStakeRequirements;
    uint256 public mintedPeakTokens;

    address public marketPeakWallet;
    TestStaking public peakStaking;
    TESTCASE_V1 public peakToken;
    address public stablecoin;
    IPancakeSwapOracle public oracle;

    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");

    constructor(
        address _marketPeakWallet,
        address _peakStaking,
        address _peakToken,
        address _stablecoin,
        address _oracle
    ) public {
        // initialize commission percentages for each level
        commissionPercentages.push(10 * (10**16)); // 10%
        commissionPercentages.push(4 * (10**16)); // 4%
        commissionPercentages.push(2 * (10**16)); // 2%
        commissionPercentages.push(1 * (10**16)); // 1%
        commissionPercentages.push(1 * (10**16)); // 1%
        commissionPercentages.push(1 * (10**16)); // 1%
        commissionPercentages.push(5 * (10**15)); // 0.5%
        commissionPercentages.push(5 * (10**15)); // 0.5%

        // initialize commission stake requirements for each level
        commissionStakeRequirements.push(0);
        commissionStakeRequirements.push(PEAK_PRECISION.mul(2000));
        commissionStakeRequirements.push(PEAK_PRECISION.mul(4000));
        commissionStakeRequirements.push(PEAK_PRECISION.mul(6000));
        commissionStakeRequirements.push(PEAK_PRECISION.mul(7000));
        commissionStakeRequirements.push(PEAK_PRECISION.mul(8000));
        commissionStakeRequirements.push(PEAK_PRECISION.mul(9000));
        commissionStakeRequirements.push(PEAK_PRECISION.mul(10000));

        // initialize rank rewards
        for (uint256 i = 0; i < 8; i = i.add(1)) {
            uint256 rewardInBUSD = 0;
            for (uint256 j = i.add(1); j <= 8; j = j.add(1)) {
                if (j == 1) {
                    rewardInBUSD = rewardInBUSD.add(BUSD_PRECISION.mul(100));
                } else if (j == 2) {
                    rewardInBUSD = rewardInBUSD.add(BUSD_PRECISION.mul(300));
                } else if (j == 3) {
                    rewardInBUSD = rewardInBUSD.add(BUSD_PRECISION.mul(600));
                } else if (j == 4) {
                    rewardInBUSD = rewardInBUSD.add(BUSD_PRECISION.mul(1200));
                } else if (j == 5) {
                    rewardInBUSD = rewardInBUSD.add(BUSD_PRECISION.mul(2400));
                } else if (j == 6) {
                    rewardInBUSD = rewardInBUSD.add(BUSD_PRECISION.mul(7500));
                } else if (j == 7) {
                    rewardInBUSD = rewardInBUSD.add(BUSD_PRECISION.mul(15000));
                } else {
                    rewardInBUSD = rewardInBUSD.add(BUSD_PRECISION.mul(50000));
                }
                rankReward[i][j] = rewardInBUSD;
            }
        }

        marketPeakWallet = _marketPeakWallet;
        peakStaking = TestStaking(_peakStaking);
        peakToken = TESTCASE_V1(_peakToken);
        stablecoin = _stablecoin;
        oracle = IPancakeSwapOracle(_oracle);

        _setupRole(SIGNER_ROLE, _peakStaking);
    }

    /**
        @notice Registers a group of referrals relationship.
        @param users The array of users
        @param referrers The group of referrers of `users`
     */
    function multiRefer(address[] calldata users, address[] calldata referrers)
        external 
        onlySigner
    {
        require(
            users.length == referrers.length,
            "PeakReward: arrays length are not equal"
        );
        for (uint256 i = 0; i < users.length; i++) {
            refer(users[i], referrers[i]);
        }
    }

    /**
        @notice Registers a referral relationship
        @param user The user who is being referred
        @param referrer The referrer of `user`
     */
    function refer(address user, address referrer) public onlySigner {
        require(!isUser[user], "PeakReward: referred is already a user");
        require(user != referrer, "PeakReward: can't refer self");
        require(
            user != address(0) && referrer != address(0),
            "PeakReward: 0 address"
        );

        isUser[user] = true;
        isUser[referrer] = true;

        referrerOf[user] = referrer;
        downlineRanks[referrer][0] = downlineRanks[referrer][0].add(1);

        emit Register(user, referrer);
    }

    function canRefer(address user, address referrer)
        public
        view
        returns (bool)
    {
        return
            !isUser[user] &&
            user != referrer &&
            user != address(0) &&
            referrer != address(0);
    }

    /**
        @notice Distributes commissions to a referrer and their referrers
        @param referrer The referrer who will receive commission
        @param commissionToken The ERC20 token that the commission is paid in
        @param rawCommission The raw commission that will be distributed amongst referrers
        @param returnLeftovers If true, leftover commission is returned to the sender. If false, leftovers will be paid to MarketPeak.
     */
    function payCommission(
        address referrer,
        address commissionToken,
        uint256 rawCommission,
        bool returnLeftovers
    ) public regUser(referrer) onlySigner returns (uint256 leftoverAmount) {
        // transfer the raw commission from `msg.sender`
        IERC20 token = IERC20(commissionToken);
        token.safeTransferFrom(msg.sender, address(this), rawCommission);

        // payout commissions to referrers of different levels
        address ptr = referrer;
        uint256 commissionLeft = rawCommission;
        uint8 i = 0;
        while (ptr != address(0) && i < COMMISSION_LEVELS) {
            if (_peakStakeOf(ptr) >= commissionStakeRequirements[i]) {
                // referrer has enough stake, give commission
                uint256 com = rawCommission.mul(commissionPercentages[i]).div(
                    COMMISSION_RATE
                );
                if (com > commissionLeft) {
                    com = commissionLeft;
                }
                token.safeTransfer(ptr, com);
                commissionLeft = commissionLeft.sub(com);
                if (commissionToken == address(peakToken)) {
                    incrementCareerValueInPeak(ptr, com);
                } else if (commissionToken == stablecoin) {
                    incrementCareerValueInBusd(ptr, com);
                }
                emit PayCommission(referrer, ptr, commissionToken, com, i);
            }

            ptr = referrerOf[ptr];
            i += 1;
        }

        // handle leftovers
        if (returnLeftovers) {
            // return leftovers to `msg.sender`
            token.safeTransfer(msg.sender, commissionLeft);
            return commissionLeft;
        } else {
            // give leftovers to MarketPeak wallet
            token.safeTransfer(marketPeakWallet, commissionLeft);
            return 0;
        }
    }

    /**
        @notice Increments a user's career value
        @param user The user
        @param incCV The CV increase amount, in Busd
     */
    function incrementCareerValueInBusd(address user, uint256 incCV)
        public
        regUser(user)
        onlySigner
    {
        careerValue[user] = careerValue[user].add(incCV);
        emit ChangedCareerValue(user, incCV, true);
    }

    /**
        @notice Increments a user's career value
        @param user The user
        @param incCVInPeak The CV increase amount, in PEAK tokens
     */
    function incrementCareerValueInPeak(address user, uint256 incCVInPeak)
        public
        regUser(user)
        onlySigner
    {
        uint256 peakPriceInBusd = _getPeakPriceInBusd();
        uint256 incCVInBusd = incCVInPeak.mul(peakPriceInBusd).div(
            PEAK_PRECISION
        );
        careerValue[user] = careerValue[user].add(incCVInBusd);
        emit ChangedCareerValue(user, incCVInBusd, true);
    }

    /**
        @notice Returns a user's rank in the PeakDeFi system based only on career value
        @param user The user whose rank will be queried
     */
    function cvRankOf(address user) public view returns (uint256) {
        uint256 cv = careerValue[user];
        if (cv < BUSD_PRECISION.mul(100)) {
            return 0;
        } else if (cv < BUSD_PRECISION.mul(250)) {
            return 1;
        } else if (cv < BUSD_PRECISION.mul(750)) {
            return 2;
        } else if (cv < BUSD_PRECISION.mul(1500)) {
            return 3;
        } else if (cv < BUSD_PRECISION.mul(3000)) {
            return 4;
        } else if (cv < BUSD_PRECISION.mul(10000)) {
            return 5;
        } else if (cv < BUSD_PRECISION.mul(50000)) {
            return 6;
        } else if (cv < BUSD_PRECISION.mul(150000)) {
            return 7;
        } else {
            return 8;
        }
    }

    function rankUp(address user) external {
        // verify rank up conditions
        uint256 currentRank = rankOf[user];
        uint256 cvRank = cvRankOf(user);
        require(
            cvRank > currentRank,
            "PeakReward: career value is not enough!"
        );
        require(
            downlineRanks[user][currentRank] >= 2 || currentRank == 0,
            "PeakReward: downlines count and requirement not passed!"
        );

        // Target rank always should be +1 rank from current rank
        uint256 targetRank = currentRank + 1;

        // increase user rank
        rankOf[user] = targetRank;
        emit RankChange(user, currentRank, targetRank);

        address referrer = referrerOf[user];
        if (referrer != address(0)) {
            downlineRanks[referrer][targetRank] = downlineRanks[referrer][
                targetRank
            ]
            .add(1);
            downlineRanks[referrer][currentRank] = downlineRanks[referrer][
                currentRank
            ]
            .sub(1);
        }

        // give user rank reward
        uint256 rewardInPeak = rankReward[currentRank][targetRank]
        .mul(PEAK_PRECISION)
        .div(_getPeakPriceInBusd());
        if (mintedPeakTokens.add(rewardInPeak) <= PEAK_MINT_CAP) {
            // mint if under cap, do nothing if over cap
            mintedPeakTokens = mintedPeakTokens.add(rewardInPeak);
            peakToken.mint(user, rewardInPeak);
            emit ReceiveRankReward(user, rewardInPeak);
        }
    }

    function canRankUp(address user) external view returns (bool) {
        uint256 currentRank = rankOf[user];
        uint256 cvRank = cvRankOf(user);
        return
            (cvRank > currentRank) &&
            (downlineRanks[user][currentRank] >= 2 || currentRank == 0);
    }

    /**
        @notice Returns a user's current staked PEAK amount, scaled by `PEAK_PRECISION`.
        @param user The user whose stake will be queried
     */
    function _peakStakeOf(address user) internal view returns (uint256) {
        return peakStaking.userStakeAmount(user);
    }

    /**
        @notice Returns the price of PEAK token in Busd, scaled by `BUSD_PRECISION`.
     */
    function _getPeakPriceInBusd() internal returns (uint256) {
        oracle.update();

        uint256 priceInBUSD = oracle.consult(
            address(peakToken),
            PEAK_PRECISION
        );
        if (priceInBUSD == 0) {
            return BUSD_PRECISION.mul(3).div(10);
        }

        return priceInBUSD;
    }
}
