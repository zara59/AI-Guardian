export const opportunities = [
  {
    id: 1,
    rank: 1,
    name: "Ethereum Staking",
    category: "Staking",
    score: 91,
    risk: "Low",
    apy: "4.2%",
    liquidity: "Very High",
    minimumAllocation: "$10",
    description: "Stake ETH to secure the Ethereum network and earn rewards. This is one of the most established and well-understood yield opportunities in DeFi.",
    whyGuardianLikesIt: "Strong protocol maturity, high liquidity and a relatively simple user experience make this a strong fit for a moderate-risk user. Ethereum's staking mechanism has been battle-tested since the Merge and has a robust validator set.",
    risks: [
      { title: "Smart-contract risk", description: "While minimal, staking contracts could contain vulnerabilities. Using battle-tested protocols mitigates this." },
      { title: "Market risk", description: "The value of ETH may fluctuate independently of staking rewards." },
      { title: "Withdrawal conditions", description: "Staked ETH may have withdrawal queues during high-demand periods." },
      { title: "Reward changes", description: "Staking APR can vary based on total network participation." }
    ],
    breakdown: { security: 30, potential: 22, sustainability: 15, liquidity: 9, userFit: 15 },
    maxBreakdown: { security: 35, potential: 25, sustainability: 15, liquidity: 10, userFit: 15 },
    expectedInteraction: "Stake assets",
    type: "staking"
  },
  {
    id: 2,
    rank: 2,
    name: "Stablecoin Lending",
    category: "Lending",
    score: 84,
    risk: "Low",
    apy: "5.8%",
    liquidity: "High",
    minimumAllocation: "$50",
    description: "Lend stablecoins like USDC or DAI on established DeFi lending protocols to earn interest from borrowers.",
    whyGuardianLikesIt: "Stablecoin lending provides predictable yields with lower volatility exposure. Established protocols like Aave and Compound have strong security track records and deep liquidity pools.",
    risks: [
      { title: "Smart-contract risk", description: "Lending protocols carry smart-contract risk, though major protocols are well-audited." },
      { title: "De-peg risk", description: "Stablecoins could lose their peg to the underlying asset in extreme conditions." },
      { title: "Utilization risk", description: "High utilization rates can limit withdrawal ability temporarily." },
      { title: "Regulatory risk", description: "Stablecoin regulations could impact availability or functionality." }
    ],
    breakdown: { security: 28, potential: 18, sustainability: 14, liquidity: 9, userFit: 15 },
    maxBreakdown: { security: 35, potential: 25, sustainability: 15, liquidity: 10, userFit: 15 },
    expectedInteraction: "Deposit stablecoins",
    type: "lending"
  },
  {
    id: 3,
    rank: 3,
    name: "Liquidity Provision",
    category: "DeFi",
    score: 68,
    risk: "Medium",
    apy: "12.5%",
    liquidity: "Medium",
    minimumAllocation: "$100",
    description: "Provide liquidity to decentralized exchange pools and earn trading fees. Returns depend on trading volume and pool composition.",
    whyGuardianLikesIt: "Higher yield potential than staking or lending, with reasonable liquidity. Well-established DEX pools on major chains offer meaningful fee income.",
    risks: [
      { title: "Impermanent loss", description: "Price divergence between paired assets can reduce the value of your position versus holding." },
      { title: "Smart-contract risk", description: "DEX contracts, while audited, can still contain vulnerabilities." },
      { title: "Market volatility", description: "Sharp price movements can amplify impermanent loss." },
      { title: "Pool composition risk", description: "Some pools may become imbalanced, affecting returns." }
    ],
    breakdown: { security: 22, potential: 20, sustainability: 11, liquidity: 7, userFit: 8 },
    maxBreakdown: { security: 35, potential: 25, sustainability: 15, liquidity: 10, userFit: 15 },
    expectedInteraction: "Provide token pair",
    type: "defi"
  },
  {
    id: 4,
    rank: 4,
    name: "Ecosystem Incentive",
    category: "Incentive",
    score: 52,
    risk: "Medium",
    apy: "8.0%",
    liquidity: "Low",
    minimumAllocation: "$25",
    description: "Participate in ecosystem incentive programs that reward early adopters of new chains or protocols with token distributions.",
    whyGuardianLikesIt: "Can provide outsized returns for early participants. Incentive programs from established ecosystems have historically rewarded engaged users.",
    risks: [
      { title: "Vesting risk", description: "Incentive tokens often have vesting schedules limiting immediate liquidity." },
      { title: "Token depreciation", description: "Incentive tokens may lose significant value after initial hype." },
      { title: "Opportunity cost", description: "Capital locked in incentive programs cannot be deployed elsewhere." },
      { title: "Complexity", description: "Multiple steps and protocols may be required to maximize rewards." }
    ],
    breakdown: { security: 18, potential: 17, sustainability: 8, liquidity: 5, userFit: 4 },
    maxBreakdown: { security: 35, potential: 25, sustainability: 15, liquidity: 10, userFit: 15 },
    expectedInteraction: "Bridge and stake",
    type: "incentive"
  },
  {
    id: 5,
    rank: 5,
    name: "New Protocol Opportunity",
    category: "Experimental",
    score: 35,
    risk: "High",
    apy: "25.0%",
    liquidity: "Very Low",
    minimumAllocation: "$200",
    description: "An unaudited yield farming protocol on a newer blockchain offering high initial APRs to attract early liquidity providers.",
    whyGuardianLikesIt: "While the yield potential is high, Guardian ranks this lower due to significant unknown risks. This may suit experienced users who understand the risks of unaudited protocols.",
    risks: [
      { title: "Smart-contract risk", description: "No independent security audit has been completed. Smart-contract vulnerabilities are a serious concern." },
      { title: "Rug-pull risk", description: "New protocols with unaudited contracts carry significant exit-scam potential." },
      { title: "Liquidity risk", description: "Very low liquidity means positions may be difficult to exit." },
      { title: "Team risk", description: "Anonymous or unproven development team increases overall project risk." }
    ],
    breakdown: { security: 10, potential: 15, sustainability: 5, liquidity: 3, userFit: 2 },
    maxBreakdown: { security: 35, potential: 25, sustainability: 15, liquidity: 10, userFit: 15 },
    expectedInteraction: "Provide single-sided liquidity",
    type: "experimental"
  }
];

export const activityData = [
  {
    id: 1,
    type: "analyzed",
    title: "Ethereum Staking analyzed",
    description: "Guardian completed security and risk analysis",
    timestamp: "2 minutes ago",
    status: "analyzed"
  },
  {
    id: 2,
    type: "ranking",
    title: "Opportunity rankings generated",
    description: "5 opportunities ranked based on your preferences",
    timestamp: "5 minutes ago",
    status: "completed"
  },
  {
    id: 3,
    type: "review",
    title: "Stablecoin Lending reviewed",
    description: "You reviewed the detailed analysis for Stablecoin Lending",
    timestamp: "12 minutes ago",
    status: "approved"
  },
  {
    id: 4,
    type: "alert",
    title: "New protocol detected",
    description: "Guardian identified a new yield opportunity on Arbitrum",
    timestamp: "1 hour ago",
    status: "pending"
  },
  {
    id: 5,
    type: "executed",
    title: "Execution pending approval",
    description: "Liquidity Provision awaiting your confirmation",
    timestamp: "2 hours ago",
    status: "pending"
  }
];

export const filterOptions = [
  { id: "all", label: "All" },
  { id: "low", label: "Low Risk" },
  { id: "medium", label: "Medium Risk" },
  { id: "high-potential", label: "High Potential" }
];
