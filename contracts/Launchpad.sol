// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./LaunchToken.sol";

contract Launchpad {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;

    uint256 public constant CREATOR_FEE_BPS = 85;
    uint256 public constant PLATFORM_FEE_BPS = 65;
    uint256 public constant TOTAL_FEE_BPS = 150;

    uint256 public constant TOKEN_SUPPLY =
        1_000_000_000 * 10 ** 18;

    address public immutable owner;
    address public platformTreasury;

    struct Market {
        address token;
        address creator;
        address pairAsset;

        uint256 virtualTokenReserve;
        uint256 virtualPairReserve;

        uint256 realPairReserve;

        bool active;
    }

    mapping(address => Market) public markets;

    mapping(address => bool) public allowedPairAssets;

    address[] public allTokens;

    event PairAssetUpdated(
        address indexed pairAsset,
        bool allowed
    );

    event TokenLaunched(
        address indexed token,
        address indexed creator,
        address indexed pairAsset,
        string name,
        string symbol
    );

    event TokenBought(
        address indexed token,
        address indexed buyer,
        uint256 pairAmountIn,
        uint256 tokenAmountOut,
        uint256 creatorFee,
        uint256 platformFee
    );

    event TokenSold(
        address indexed token,
        address indexed seller,
        uint256 tokenAmountIn,
        uint256 pairAmountOut,
        uint256 creatorFee,
        uint256 platformFee
    );

    event TreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address treasury_) {
        require(
            treasury_ != address(0),
            "Invalid treasury"
        );

        owner = msg.sender;
        platformTreasury = treasury_;
    }

    function setPlatformTreasury(
        address newTreasury
    ) external onlyOwner {
        require(
            newTreasury != address(0),
            "Invalid treasury"
        );

        address oldTreasury = platformTreasury;

        platformTreasury = newTreasury;

        emit TreasuryUpdated(
            oldTreasury,
            newTreasury
        );
    }

    function setPairAsset(
        address pairAsset,
        bool allowed
    ) external onlyOwner {
        require(
            pairAsset != address(0),
            "Invalid pair asset"
        );

        allowedPairAssets[pairAsset] = allowed;

        emit PairAssetUpdated(
            pairAsset,
            allowed
        );
    }

    function launchToken(
        string calldata name_,
        string calldata symbol_,
        address pairAsset,
        uint256 virtualPairReserve
    ) external returns (address tokenAddress) {
        require(
            allowedPairAssets[pairAsset],
            "Pair not allowed"
        );

        require(
            virtualPairReserve > 0,
            "Invalid starting reserve"
        );

        LaunchToken token = new LaunchToken(
            name_,
            symbol_,
            msg.sender,
            address(this)
        );

        tokenAddress = address(token);

        markets[tokenAddress] = Market({
            token: tokenAddress,
            creator: msg.sender,
            pairAsset: pairAsset,
            virtualTokenReserve: TOKEN_SUPPLY,
            virtualPairReserve: virtualPairReserve,
            realPairReserve: 0,
            active: true
        });

        allTokens.push(tokenAddress);

        emit TokenLaunched(
            tokenAddress,
            msg.sender,
            pairAsset,
            name_,
            symbol_
        );
    }

    function buy(
        address tokenAddress,
        uint256 pairAmountIn,
        uint256 minTokensOut
    ) external {
        Market storage market =
            markets[tokenAddress];

        require(
            market.active,
            "Market inactive"
        );

        require(
            pairAmountIn > 0,
            "Invalid amount"
        );

        IERC20 pair =
            IERC20(market.pairAsset);

        pair.safeTransferFrom(
            msg.sender,
            address(this),
            pairAmountIn
        );

        uint256 creatorFee =
            (pairAmountIn * CREATOR_FEE_BPS) /
            BPS;

        uint256 platformFee =
            (pairAmountIn * PLATFORM_FEE_BPS) /
            BPS;

        uint256 amountAfterFee =
            pairAmountIn
            - creatorFee
            - platformFee;

        uint256 tokenAmountOut =
            getBuyAmountOut(
                tokenAddress,
                amountAfterFee
            );

        require(
            tokenAmountOut >= minTokensOut,
            "Slippage exceeded"
        );

        require(
            tokenAmountOut <
                market.virtualTokenReserve,
            "Insufficient token liquidity"
        );

        market.virtualPairReserve +=
            amountAfterFee;

        market.virtualTokenReserve -=
            tokenAmountOut;

        market.realPairReserve +=
            amountAfterFee;

        if (creatorFee > 0) {
            pair.safeTransfer(
                market.creator,
                creatorFee
            );
        }

        if (platformFee > 0) {
            pair.safeTransfer(
                platformTreasury,
                platformFee
            );
        }

        IERC20(tokenAddress).safeTransfer(
            msg.sender,
            tokenAmountOut
        );

        emit TokenBought(
            tokenAddress,
            msg.sender,
            pairAmountIn,
            tokenAmountOut,
            creatorFee,
            platformFee
        );
    }

    function sell(
        address tokenAddress,
        uint256 tokenAmountIn,
        uint256 minPairOut
    ) external {
        Market storage market =
            markets[tokenAddress];

        require(
            market.active,
            "Market inactive"
        );

        require(
            tokenAmountIn > 0,
            "Invalid amount"
        );

        IERC20 token =
            IERC20(tokenAddress);

        IERC20 pair =
            IERC20(market.pairAsset);

        uint256 grossPairOut =
            getSellAmountOut(
                tokenAddress,
                tokenAmountIn
            );

        require(
            grossPairOut > 0,
            "Amount too small"
        );

        require(
            grossPairOut <=
                market.realPairReserve,
            "Insufficient pair liquidity"
        );

        uint256 creatorFee =
            (grossPairOut * CREATOR_FEE_BPS) /
            BPS;

        uint256 platformFee =
            (grossPairOut * PLATFORM_FEE_BPS) /
            BPS;

        uint256 pairAmountOut =
            grossPairOut
            - creatorFee
            - platformFee;

        require(
            pairAmountOut >= minPairOut,
            "Slippage exceeded"
        );

        token.safeTransferFrom(
            msg.sender,
            address(this),
            tokenAmountIn
        );

        market.virtualTokenReserve +=
            tokenAmountIn;

        market.virtualPairReserve -=
            grossPairOut;

        market.realPairReserve -=
            grossPairOut;

        if (creatorFee > 0) {
            pair.safeTransfer(
                market.creator,
                creatorFee
            );
        }

        if (platformFee > 0) {
            pair.safeTransfer(
                platformTreasury,
                platformFee
            );
        }

        pair.safeTransfer(
            msg.sender,
            pairAmountOut
        );

        emit TokenSold(
            tokenAddress,
            msg.sender,
            tokenAmountIn,
            pairAmountOut,
            creatorFee,
            platformFee
        );
    }

    function getBuyAmountOut(
        address tokenAddress,
        uint256 pairAmountIn
    ) public view returns (uint256) {
        Market memory market =
            markets[tokenAddress];

        require(
            market.active,
            "Market inactive"
        );

        uint256 numerator =
            market.virtualTokenReserve *
            pairAmountIn;

        uint256 denominator =
            market.virtualPairReserve +
            pairAmountIn;

        return numerator / denominator;
    }

    function getSellAmountOut(
        address tokenAddress,
        uint256 tokenAmountIn
    ) public view returns (uint256) {
        Market memory market =
            markets[tokenAddress];

        require(
            market.active,
            "Market inactive"
        );

        uint256 numerator =
            market.virtualPairReserve *
            tokenAmountIn;

        uint256 denominator =
            market.virtualTokenReserve +
            tokenAmountIn;

        return numerator / denominator;
    }

    function getAllTokensLength()
        external
        view
        returns (uint256)
    {
        return allTokens.length;
    }

    function getMarket(
        address tokenAddress
    )
        external
        view
        returns (
            address token,
            address creator,
            address pairAsset,
            uint256 virtualTokenReserve,
            uint256 virtualPairReserve,
            uint256 realPairReserve,
            bool active
        )
    {
        Market memory market =
            markets[tokenAddress];

        return (
            market.token,
            market.creator,
            market.pairAsset,
            market.virtualTokenReserve,
            market.virtualPairReserve,
            market.realPairReserve,
            market.active
        );
    }
}
