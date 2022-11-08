// @ts-ignore
import { formatUnits, parseEther } from "ethers/lib/utils";
import { artifacts, contract } from "hardhat";
import { assert, expect } from "chai";
import { BN, constants, expectEvent, expectRevert, time } from "@openzeppelin/test-helpers";
import { BigNumber } from "ethers";

let LandsplatformFactory = artifacts.require("./LandsplatformFactory.sol");
let LandsplatformRouter = artifacts.require("./LandsplatformRouter.sol");
const MockERC20 = artifacts.require("./utils/MockERC20.sol");
const LandsplatformPair = artifacts.require("./LandsplatformPair.sol");
const LandsplatformZapV1 = artifacts.require("./LandsplatformZapV1.sol");
const WBNB = artifacts.require("./WBNB.sol");

contract("LandsplatformZapV1", ([alice, bob, carol, david, erin]) => {
  let maxZapReverseRatio;
  let pairAB: { totalSupply: () => any; approve: (arg0: any, arg1: any, arg2: { from: string; }) => any; address: any; };
  let pairBC: { totalSupply: () => any; approve: (arg0: any, arg1: any, arg2: { from: string; }) => any; address: any; };
  let pairAC: { totalSupply: () => any; approve: (arg0: any, arg1: any, arg2: { from: string; }) => any; address: any; balanceOf: (arg0: string) => any; };
  let landsplatformZap: { address: any; estimateZapInSwap: (arg0: any, arg1: BigNumber, arg2: any) => any; zapInToken: (arg0: any, arg1: BigNumber, arg2: any, arg3: BigNumber, arg4: { from: string; }) => any; zapInBNB: (arg0: any, arg1: BigNumber, arg2: { from: string; value: string; }) => any; estimateZapInRebalancingSwap: (arg0: any, arg1: any, arg2: BigNumber, arg3: BigNumber, arg4: any) => any; zapInBNBRebalancing: (arg0: any, arg1: BigNumber, arg2: any, arg3: BigNumber, arg4: BigNumber, arg5: boolean, arg6: { from: string; value: string; }) => any; zapInTokenRebalancing: (arg0: any, arg1: any, arg2: BigNumber, arg3: BigNumber, arg4: any, arg5: BigNumber, arg6: BigNumber, arg7: boolean, arg8: { from: string; }) => any; estimateZapOutSwap: (arg0: any, arg1: BigNumber, arg2: any) => any; zapOutToken: (arg0: any, arg1: any, arg2: BigNumber, arg3: BigNumber, arg4: { from: string; }) => any; zapOutBNB: (arg0: any, arg1: BigNumber, arg2: BigNumber, arg3: { from: string; }) => any; };
  let landsplatformRouter: { address: any; addLiquidity: (arg0: any, arg1: any, arg2: BigNumber, arg3: BigNumber, arg4: BigNumber, arg5: BigNumber, arg6: string, arg7: any, arg8: { from: string; }) => any; addLiquidityETH: (arg0: any, arg1: BigNumber, arg2: BigNumber, arg3: BigNumber, arg4: string, arg5: any, arg6: { from: string; value: string; }) => any; };
  let landsplatformFactory: { address: any; createPair: (arg0: any, arg1: any, arg2: { from: string; }) => any; };
  let tokenA: { address: any; mintTokens: (arg0: BigNumber, arg1: { from: string; }) => any; approve: (arg0: any, arg1: any, arg2: { from: string; }) => any; balanceOf: (arg0: any) => any; };
  let tokenC: { address: any; mintTokens: (arg0: BigNumber, arg1: { from: string; }) => any; approve: (arg0: any, arg1: any, arg2: { from: string; }) => any; balanceOf: (arg0: any) => any; };
  let wrappedBNB: { address: any; approve: (arg0: any, arg1: any, arg2: { from: string; }) => any; balanceOf: (arg0: any) => any; deposit: (arg0: { from: string; value: string; }) => any; };

  before(async () => {
    // Deploy Factory
    landsplatformFactory = await LandsplatformFactory.new(alice, { from: alice });

    console.log('Factory:', landsplatformFactory.address)
    // Deploy Wrapped BNB
    wrappedBNB = await WBNB.new({ from: alice });

    console.log('WBNB:', wrappedBNB.address)

    // Deploy Router
    landsplatformRouter = await LandsplatformRouter.new(landsplatformFactory.address, wrappedBNB.address, { from: alice });

    console.log('Router:', landsplatformRouter.address)

    // Deploy ZapV1
    maxZapReverseRatio = 100; // 1%
    landsplatformZap = await LandsplatformZapV1.new(wrappedBNB.address, landsplatformRouter.address, maxZapReverseRatio, { from: alice });

    console.log('Zap:', landsplatformZap.address)

    // Deploy ERC20s
    tokenA = await MockERC20.new("Token A", "TA", parseEther("10000000"), { from: alice });
    tokenC = await MockERC20.new("Token C", "TC", parseEther("10000000"), { from: alice });

    // Create 3 LP tokens
    let result = await landsplatformFactory.createPair(tokenA.address, wrappedBNB.address, { from: alice });
    pairAB = await LandsplatformPair.at(result.logs[0].args[2]);

    result = await landsplatformFactory.createPair(wrappedBNB.address, tokenC.address, { from: alice });
    pairBC = await LandsplatformPair.at(result.logs[0].args[2]);

    result = await landsplatformFactory.createPair(tokenA.address, tokenC.address, { from: alice });
    pairAC = await LandsplatformPair.at(result.logs[0].args[2]);

    assert.equal(String(await pairAB.totalSupply()), parseEther("0").toString());
    assert.equal(String(await pairBC.totalSupply()), parseEther("0").toString());
    assert.equal(String(await pairAC.totalSupply()), parseEther("0").toString());

    // Mint and approve all contracts
    for (let thisUser of [alice, bob, carol, david, erin]) {
      await tokenA.mintTokens(parseEther("2000000"), { from: thisUser });
      await tokenC.mintTokens(parseEther("2000000"), { from: thisUser });

      await tokenA.approve(landsplatformRouter.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await tokenA.approve(landsplatformZap.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await tokenC.approve(landsplatformRouter.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await tokenC.approve(landsplatformZap.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await wrappedBNB.approve(landsplatformRouter.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await wrappedBNB.approve(landsplatformZap.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await pairAB.approve(landsplatformZap.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await pairBC.approve(landsplatformZap.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await pairAC.approve(landsplatformZap.address, constants.MAX_UINT256, {
        from: thisUser,
      });
    }
  });

  describe("Normal cases for liquidity provision and zap ins", async () => {
    it("User adds liquidity to LP tokens", async function () {
      const deadline = new BN(await time.latest()).add(new BN("100"));

      /* Add liquidity (Pancake Router)
       * address tokenB,
       * uint256 amountADesired,
       * uint256 amountBDesired,
       * uint256 amountAMin,
       * uint256 amountBMin,
       * address to,
       * uint256 deadline
       */

      // 1 A = 1 C
      let result = await landsplatformRouter.addLiquidity(
        tokenC.address,
        tokenA.address,
        parseEther("1000000"), // 1M token A
        parseEther("1000000"), // 1M token B
        parseEther("1000000"),
        parseEther("1000000"),
        bob,
        deadline,
        { from: bob }
      );

      console.log('A:', tokenA.address)
      console.log('C:', tokenC.address)

      expectEvent.inTransaction(result.receipt.transactionHash, tokenA, "Transfer", {
        from: bob,
        to: pairAC.address,
        value: parseEther("1000000").toString(),
      });

      expectEvent.inTransaction(result.receipt.transactionHash, tokenC, "Transfer", {
        from: bob,
        to: pairAC.address,
        value: parseEther("1000000").toString(),
      });

      assert.equal(String(await pairAC.totalSupply()), parseEther("1000000").toString());
      assert.equal(String(await tokenA.balanceOf(pairAC.address)), parseEther("1000000").toString());
      assert.equal(String(await tokenC.balanceOf(pairAC.address)), parseEther("1000000").toString());

      // 1 BNB = 100 A
      result = await landsplatformRouter.addLiquidityETH(
        tokenA.address,
        parseEther("100000"), // 100k token A
        parseEther("100000"), // 100k token A
        parseEther("1000"), // 1,000 BNB
        bob,
        deadline,
        { from: bob, value: parseEther("1000").toString() }
      );

      expectEvent.inTransaction(result.receipt.transactionHash, tokenA, "Transfer", {
        from: bob,
        to: pairAB.address,
        value: parseEther("100000").toString(),
      });

      assert.equal(String(await pairAB.totalSupply()), parseEther("10000").toString());
      assert.equal(String(await wrappedBNB.balanceOf(pairAB.address)), parseEther("1000").toString());
      assert.equal(String(await tokenA.balanceOf(pairAB.address)), parseEther("100000").toString());

      // 1 BNB = 100 C
      result = await landsplatformRouter.addLiquidityETH(
        tokenC.address,
        parseEther("100000"), // 100k token C
        parseEther("100000"), // 100k token C
        parseEther("1000"), // 1,000 BNB
        bob,
        deadline,
        { from: bob, value: parseEther("1000").toString() }
      );

      expectEvent.inTransaction(result.receipt.transactionHash, tokenC, "Transfer", {
        from: bob,
        to: pairBC.address,
        value: parseEther("100000").toString(),
      });

      assert.equal(String(await pairBC.totalSupply()), parseEther("10000").toString());
      assert.equal(String(await wrappedBNB.balanceOf(pairBC.address)), parseEther("1000").toString());
      assert.equal(String(await tokenC.balanceOf(pairBC.address)), parseEther("100000").toString());
    });

    it("User completes zapIn with tokenA (pair tokenA/tokenC)", async function () {
      const lpToken = pairAC.address;
      const tokenToZap = tokenA.address;
      const tokenAmountIn = parseEther("1");

      const estimation = await landsplatformZap.estimateZapInSwap(tokenToZap, parseEther("1"), lpToken);
      assert.equal(estimation[2], tokenC.address);

      // Setting up slippage at 0.5%
      const minTokenAmountOut = new BN(estimation[1].toString()).mul(new BN("9995")).div(new BN("10000"));

      const result = await landsplatformZap.zapInToken(tokenToZap, tokenAmountIn, lpToken, minTokenAmountOut, {
        from: carol,
      });

      expectEvent(result, "ZapIn", {
        tokenToZap: tokenToZap,
        lpToken: lpToken,
        tokenAmountIn: parseEther("1").toString(),
        lpTokenAmountReceived: parseEther("0.499373703104732887").toString(),
        user: carol,
      });

      expectEvent.inTransaction(result.receipt.transactionHash, pairAC, "Transfer", {
        from: constants.ZERO_ADDRESS,
        to: carol,
        value: parseEther("0.499373703104732887").toString(),
      });

      assert.equal(String(await pairAC.balanceOf(carol)), parseEther("0.499373703104732887").toString());
      console.info("Balance tokenA: " + formatUnits(String(await tokenA.balanceOf(landsplatformZap.address)), 18));
      console.info("Balance WBNB: " + formatUnits(String(await wrappedBNB.balanceOf(landsplatformZap.address)), 18));
      console.info("Balance tokenC: " + formatUnits(String(await tokenC.balanceOf(landsplatformZap.address)), 18));
    });

    it("User completes zapIn with BNB (pair BNB/tokenC)", async function () {
      const lpToken = pairBC.address;
      const tokenAmountIn = parseEther("1");

      const estimation = await landsplatformZap.estimateZapInSwap(wrappedBNB.address, parseEther("1"), lpToken);
      assert.equal(estimation[2], tokenC.address);

      // Setting up slippage at 0.5%
      const minTokenAmountOut = new BN(estimation[1].toString()).mul(new BN("9995")).div(new BN("10000"));

      const result = await landsplatformZap.zapInBNB(lpToken, minTokenAmountOut, {
        from: carol,
        value: tokenAmountIn.toString(),
      });

      expectEvent(result, "ZapIn", {
        tokenToZap: constants.ZERO_ADDRESS,
        lpToken: lpToken,
        tokenAmountIn: parseEther("1").toString(),
        lpTokenAmountReceived: parseEther("4.992493116557219690").toString(),
        user: carol,
      });

      console.info("Balance tokenA: " + formatUnits(String(await tokenA.balanceOf(landsplatformZap.address)), 18));
      console.info("Balance WBNB: " + formatUnits(String(await wrappedBNB.balanceOf(landsplatformZap.address)), 18));
      console.info("Balance tokenC: " + formatUnits(String(await tokenC.balanceOf(landsplatformZap.address)), 18));
    });

    it("User completes zapInRebalancing with BNB (pair BNB/tokenC)", async function () {
      const lpToken = pairBC.address;
      const token0AmountIn = parseEther("1"); // 1 BNB
      const token1AmountIn = parseEther("50"); // 50 token C

      const estimation = await landsplatformZap.estimateZapInRebalancingSwap(
        wrappedBNB.address,
        tokenC.address,
        token0AmountIn,
        token1AmountIn,
        lpToken
      );

      assert.equal(estimation[2], true);

      // Setting up slippage at 2x 0.5%
      const minTokenAmountOut = new BN(estimation[1].toString()).mul(new BN("9995")).div(new BN("10000"));
      const maxTokenAmountIn = new BN(estimation[0].toString()).mul(new BN("10005")).div(new BN("10000"));

      const result = await landsplatformZap.zapInBNBRebalancing(
        tokenC.address,
        token1AmountIn,
        lpToken,
        maxTokenAmountIn,
        minTokenAmountOut,
        estimation[2],
        {
          from: carol,
          value: token0AmountIn.toString(),
        }
      );

      expectEvent(result, "ZapInRebalancing", {
        token0ToZap: constants.ZERO_ADDRESS,
        token1ToZap: tokenC.address,
        lpToken: lpToken,
        token0AmountIn: token0AmountIn.toString(),
        token1AmountIn: token1AmountIn.toString(),
        lpTokenAmountReceived: parseEther("7.495311264946730291").toString(),
        user: carol,
      });

      console.info("Balance tokenA: " + formatUnits(String(await tokenA.balanceOf(landsplatformZap.address)), 18));
      console.info("Balance WBNB: " + formatUnits(String(await wrappedBNB.balanceOf(landsplatformZap.address)), 18));
      console.info("Balance tokenC: " + formatUnits(String(await tokenC.balanceOf(landsplatformZap.address)), 18));
    });

    it("User completes zapInRebalancing with tokens (tokenA/tokenC)", async function () {
      const lpToken = pairAC.address;
      const token0AmountIn = parseEther("1000"); // 1000 token A
      const token1AmountIn = parseEther("5000"); // 5000 token C

      const estimation = await landsplatformZap.estimateZapInRebalancingSwap(
        tokenA.address,
        tokenC.address,
        token0AmountIn,
        token1AmountIn,
        lpToken
      );

      assert.equal(estimation[2], false);

      // Setting up slippage at 2x 0.5%
      const minTokenAmountOut = new BN(estimation[1].toString()).mul(new BN("9995")).div(new BN("10000"));
      const maxTokenAmountIn = new BN(estimation[0].toString()).mul(new BN("10005")).div(new BN("10000"));

      const result = await landsplatformZap.zapInTokenRebalancing(
        tokenA.address,
        tokenC.address,
        token0AmountIn,
        token1AmountIn,
        lpToken,
        maxTokenAmountIn,
        minTokenAmountOut,
        estimation[2],
        {
          from: carol,
        }
      );

      expectEvent(result, "ZapInRebalancing", {
        token0ToZap: tokenA.address,
        token1ToZap: tokenC.address,
        lpToken: lpToken,
        token0AmountIn: token0AmountIn.toString(),
        token1AmountIn: token1AmountIn.toString(),
        lpTokenAmountReceived: "2995503304234356879808",
        user: carol,
      });

      console.info("Balance tokenA: " + formatUnits(String(await tokenA.balanceOf(landsplatformZap.address)), 18));
      console.info("Balance WBNB: " + formatUnits(String(await wrappedBNB.balanceOf(landsplatformZap.address)), 18));
      console.info("Balance tokenC: " + formatUnits(String(await tokenC.balanceOf(landsplatformZap.address)), 18));
    });

    it("User completes zapOut to token (tokenA/tokenC)", async function () {
      const lpToken = pairAC.address;
      const lpTokenAmount = parseEther("1");
      const tokenToReceive = tokenA.address;

      const estimation = await landsplatformZap.estimateZapOutSwap(lpToken, lpTokenAmount, tokenToReceive);
      assert.equal(estimation[2], tokenC.address);

      const minTokenAmountOut = new BN(estimation[1].toString()).mul(new BN("9995")).div(new BN("10000"));

      const result = await landsplatformZap.zapOutToken(lpToken, tokenToReceive, lpTokenAmount, minTokenAmountOut, {
        from: carol,
      });

      expectEvent(result, "ZapOut", {
        lpToken: lpToken,
        tokenToReceive: tokenToReceive,
        lpTokenAmount: lpTokenAmount.toString(),
        tokenAmountReceived: parseEther("1.999586848572742784").toString(),
        user: carol,
      });

      console.info("Balance tokenA: " + formatUnits(String(await tokenA.balanceOf(landsplatformZap.address)), 18));
      console.info("Balance WBNB: " + formatUnits(String(await wrappedBNB.balanceOf(landsplatformZap.address)), 18));
      console.info("Balance tokenC: " + formatUnits(String(await tokenC.balanceOf(landsplatformZap.address)), 18));
    });

    it("User completes zapOut to BNB (BNB/tokenC)", async function () {
      const lpToken = pairBC.address;
      const lpTokenAmount = parseEther("1");
      const tokenToReceive = wrappedBNB.address;

      const estimation = await landsplatformZap.estimateZapOutSwap(lpToken, lpTokenAmount, tokenToReceive);
      assert.equal(estimation[2], tokenC.address);

      const minTokenAmountOut = new BN(estimation[1].toString()).mul(new BN("9995")).div(new BN("10000"));

      const result = await landsplatformZap.zapOutBNB(lpToken, lpTokenAmount, minTokenAmountOut, {
        from: carol,
      });

      expectEvent(result, "ZapOut", {
        lpToken: lpToken,
        tokenToReceive: constants.ZERO_ADDRESS,
        lpTokenAmount: lpTokenAmount.toString(),
        tokenAmountReceived: parseEther("0.199890295552765397").toString(),
        user: carol,
      });

      console.info("Balance tokenA: " + formatUnits(String(await tokenA.balanceOf(landsplatformZap.address)), 18));
      console.info("Balance WBNB: " + formatUnits(String(await wrappedBNB.balanceOf(landsplatformZap.address)), 18));
      console.info("Balance tokenC: " + formatUnits(String(await tokenC.balanceOf(landsplatformZap.address)), 18));
    });

    it("Zap estimation fail if wrong tokens", async function () {
      await expectRevert(
        landsplatformZap.estimateZapInSwap(wrappedBNB.address, parseEther("1"), pairAC.address),
        "Zap: Wrong tokens"
      );
      await expectRevert(
        landsplatformZap.estimateZapInRebalancingSwap(
          tokenA.address,
          wrappedBNB.address,
          parseEther("1"),
          parseEther("1"),
          pairAC.address
        ),
        "Zap: Wrong token1"
      );

      await expectRevert(
        landsplatformZap.estimateZapInRebalancingSwap(
          wrappedBNB.address,
          tokenA.address,
          parseEther("1"),
          parseEther("1"),
          pairAC.address
        ),
        "Zap: Wrong token0"
      );
      await expectRevert(
        landsplatformZap.estimateZapInRebalancingSwap(
          tokenA.address,
          tokenA.address,
          parseEther("1"),
          parseEther("1"),
          pairAC.address
        ),
        "Zap: Same tokens"
      );

      await expectRevert(
        landsplatformZap.estimateZapOutSwap(pairAC.address, parseEther("1"), wrappedBNB.address),
        "Zap: Token not in LP"
      );
    });

    it("Zap estimations work as expected", async function () {
      // Verify estimations are the same regardless of the argument ordering
      const estimation0 = await landsplatformZap.estimateZapInRebalancingSwap(
        tokenA.address,
        tokenC.address,
        parseEther("0.5"),
        parseEther("1"),
        pairAC.address
      );
      const estimation1 = await landsplatformZap.estimateZapInRebalancingSwap(
        tokenC.address,
        tokenA.address,
        parseEther("1"),
        parseEther("0.5"),
        pairAC.address
      );

      assert.equal(estimation0[0].toString(), estimation1[0].toString());
      assert.equal(estimation0[1].toString(), estimation1[1].toString());
      assert.equal(!estimation0[2], estimation1[2]);

      // Verify estimations are the same for zapIn and zapInRebalancing with 0 for one of the quantity
      const estimation2 = await landsplatformZap.estimateZapInSwap(tokenA.address, parseEther("5"), pairAC.address);
      const estimation3 = await landsplatformZap.estimateZapInRebalancingSwap(
        tokenA.address,
        tokenC.address,
        parseEther("5"),
        parseEther("0"),
        pairAC.address
      );

      assert.equal(estimation2[0].toString(), estimation3[0].toString());
      assert.equal(estimation2[1].toString(), estimation3[1].toString());
    });

    it("Cannot zap if wrong direction/tokens used", async function () {
      await expectRevert(
        landsplatformZap.zapInToken(tokenA.address, parseEther("1"), pairBC.address, parseEther("0.51"), { from: carol }),
        "Zap: Wrong tokens"
      );
      await expectRevert(
        landsplatformZap.zapInBNB(pairAC.address, parseEther("0.51"), { from: carol, value: parseEther("0.51").toString() }),
        "Zap: Wrong tokens"
      );

      await expectRevert(
        landsplatformZap.zapOutToken(pairBC.address, tokenA.address, parseEther("0.51"), parseEther("0.51"), { from: carol }),
        "Zap: Token not in LP"
      );

      await expectRevert(
        landsplatformZap.zapOutBNB(pairAC.address, parseEther("0.51"), parseEther("0.51"), { from: carol }),
        "Zap: Token not in LP"
      );

      await expectRevert(
        landsplatformZap.zapInTokenRebalancing(
          tokenA.address,
          tokenC.address,
          parseEther("1"),
          parseEther("1"),
          pairBC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          true,
          { from: carol }
        ),
        "Zap: Wrong token0"
      );

      await expectRevert(
        landsplatformZap.zapInTokenRebalancing(
          tokenC.address,
          tokenA.address,
          parseEther("1"),
          parseEther("1"),
          pairBC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          true,
          { from: carol }
        ),
        "Zap: Wrong token1"
      );

      await expectRevert(
        landsplatformZap.zapInTokenRebalancing(
          tokenC.address,
          tokenC.address,
          parseEther("1"),
          parseEther("1"),
          pairBC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          true,
          { from: carol }
        ),
        "Zap: Same tokens"
      );

      await expectRevert(
        landsplatformZap.zapInBNBRebalancing(
          tokenC.address,
          parseEther("1"),
          pairAB.address,
          parseEther("0.5"),
          parseEther("0.5"),
          true,
          { from: carol, value: parseEther("0.1").toString() }
        ),
        "Zap: Wrong token1"
      );
      await expectRevert(
        landsplatformZap.zapInBNBRebalancing(
          tokenA.address,
          parseEther("1"),
          pairAC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          true,
          { from: carol, value: parseEther("0.1").toString() }
        ),
        "Zap: Wrong token0"
      );

      // David gets WBNB
      const result = await wrappedBNB.deposit({ from: david, value: parseEther("1").toString() });
      expectEvent(result, "Deposit", { dst: david, wad: parseEther("1").toString() });

      await expectRevert(
        landsplatformZap.zapInBNBRebalancing(
          wrappedBNB.address,
          parseEther("1"),
          pairBC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          false,
          { from: david, value: parseEther("0.1").toString() }
        ),
        "Zap: Same tokens"
      );

      // TokenC (token0) > BNB (token1) --> sell token1 (should be false)
      await expectRevert(
        landsplatformZap.zapInBNBRebalancing(
          tokenC.address,
          parseEther("0.05"),
          pairBC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          true,
          { from: david, value: parseEther("0.0000000001").toString() }
        ),
        "Zap: Wrong trade direction"
      );

      // TokenC (token0) < BNB (token1) --> sell token0 (should be true)
      await expectRevert(
        landsplatformZap.zapInBNBRebalancing(
          tokenC.address,
          parseEther("0.0000000001"),
          pairBC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          false,
          { from: david, value: parseEther("0.05").toString() }
        ),
        "Zap: Wrong trade direction"
      );

      // TokenA (token0) > tokenC (token1) --> sell token0 (should be true)
      await expectRevert(
        landsplatformZap.zapInTokenRebalancing(
          tokenA.address,
          tokenC.address,
          parseEther("1"),
          parseEther("0"),
          pairAC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          false,
          { from: david }
        ),
        "Zap: Wrong trade direction"
      );

      // TokenA (token0) < tokenC (token1) --> sell token0 (should be true)
      await expectRevert(
        landsplatformZap.zapInTokenRebalancing(
          tokenA.address,
          tokenC.address,
          parseEther("0"),
          parseEther("1"),
          pairAC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          true,
          { from: david }
        ),
        "Zap: Wrong trade direction"
      );
    });
  });
});