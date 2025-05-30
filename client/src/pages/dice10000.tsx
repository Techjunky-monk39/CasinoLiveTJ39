import React from 'react';
import { useNotification } from '@/components/ui/notification-banner';
import { usePlayer } from '@/contexts/PlayerContext';
import { GameType } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

export default function Dice10000() {
  const { player, updateBalance } = usePlayer();
  const { showNotification } = useNotification();
  
  const [currentBet, setCurrentBet] = React.useState(100);
  const [gameState, setGameState] = React.useState<"betting" | "rolling" | "finished">("betting");
  const [dice, setDice] = React.useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [heldDice, setHeldDice] = React.useState<number[]>([]);
  const [score, setScore] = React.useState<number>(0);
  const [totalScore, setTotalScore] = React.useState<number>(0);
  const [selectedDice, setSelectedDice] = React.useState<number[]>([]);
  const [rolls, setRolls] = React.useState<number>(0);
  const [minScoreRequired, setMinScoreRequired] = React.useState<number>(1000);
  
  // Check if any scoring dice are present
  const hasScoringDice = React.useMemo(() => {
    const activeDice = dice.filter((_, index) => !heldDice.includes(index));
    
    // Check for 1s and 5s
    const hasOneOrFive = activeDice.some(d => d === 1 || d === 5);
    
    // Check for three-of-a-kind
    const counts: { [key: number]: number } = {};
    activeDice.forEach(value => {
      counts[value] = (counts[value] || 0) + 1;
    });
    
    const hasThreeOfAKind = Object.values(counts).some(count => count >= 3);
    
    // Check for a straight
    if (activeDice.length === 6) {
      const sortedValues = [...activeDice].sort((a, b) => a - b);
      const isStraight = 
        sortedValues[0] === 1 &&
        sortedValues[1] === 2 &&
        sortedValues[2] === 3 &&
        sortedValues[3] === 4 &&
        sortedValues[4] === 5 &&
        sortedValues[5] === 6;
      
      if (isStraight) return true;
    }
    
    return hasOneOrFive || hasThreeOfAKind;
  }, [dice, heldDice]);
  
  // Check if player can bank score
  const canBankScore = React.useMemo(() => {
    if (selectedDice.length === 0) return false;
    
    // Must have 2 or fewer dice remaining to bank
    const remainingCount = dice.filter((v, i) => 
      v > 0 && !selectedDice.includes(i) && !heldDice.includes(i)
    ).length;
    
    if (remainingCount > 2) return false;
    
    // Calculate current roll score
    const currentRollScore = calculateScore(selectedDice.map(index => dice[index]));
    
    // Check if score meets minimum requirements
    if (totalScore === 0 && currentRollScore < minScoreRequired) return false;
    if (totalScore > 0 && currentRollScore < 750) return false;
    
    return true;
  }, [dice, selectedDice, heldDice, totalScore, minScoreRequired]);
  
  const decreaseBet = () => {
    if (gameState !== "betting") return;
    if (currentBet > 50) {
      setCurrentBet(currentBet - 50);
    }
  };

  const increaseBet = () => {
    if (gameState !== "betting") return;
    if (currentBet < player.balance) {
      setCurrentBet(currentBet + 50);
    }
  };
  
  const startGame = async () => {
    if (gameState !== "betting") return;
    
    if (player.balance < currentBet) {
      showNotification("Not enough credits to place this bet!");
      return;
    }
    
    // Deduct bet from balance
    const success = await updateBalance(-currentBet);
    if (!success) {
      showNotification("Failed to place bet. Please try again.");
      return;
    }
    
    // First set the game state
    setGameState("rolling");
    setHeldDice([]);
    setScore(0);
    setTotalScore(0);
    setSelectedDice([]);
    setRolls(0);
    setMinScoreRequired(1000);
    
    // Generate new dice directly
    const newDice = Array(6).fill(0).map(() => Math.floor(Math.random() * 6) + 1);
    console.log("Initial dice roll:", newDice);
    setDice(newDice);
  };
  
  const rollDice = () => {
    if (gameState !== "rolling") return;
    
    // Add previously selected dice to held dice
    if (selectedDice.length > 0) {
      setHeldDice([...heldDice, ...selectedDice]);
    }
    
    // If all dice are held or first roll, get a new set of 6 dice
    const allDiceAreHeld = heldDice.length + selectedDice.length === 6;
    const isFirstRoll = dice.every(value => value === 0);
    
    if (allDiceAreHeld || isFirstRoll) {
      // Generate 6 brand new dice
      const newDice = Array(6).fill(0).map(() => Math.floor(Math.random() * 6) + 1);
      console.log("Generated new dice:", newDice);
      setDice(newDice);
      setHeldDice([]);
    } else {
      // Keep held dice, roll the rest
      const newDice = [...dice];
      
      // Reset selected dice
      selectedDice.forEach(index => {
        newDice[index] = 0; // Mark as held
      });
      
      // Roll new values for dice that aren't held
      for (let i = 0; i < 6; i++) {
        if (newDice[i] === 0 || (!selectedDice.includes(i) && !heldDice.includes(i))) {
          newDice[i] = Math.floor(Math.random() * 6) + 1;
        }
      }
      
      console.log("Rolling remaining dice:", newDice);
      setDice(newDice);
    }
    
    setSelectedDice([]);
    setRolls(rolls + 1);
  };
  
  const toggleDiceSelection = (index: number) => {
    if (gameState !== "rolling") return;
    
    // Can't select dice that are already held
    if (heldDice.includes(index)) return;
    
    if (selectedDice.includes(index)) {
      setSelectedDice(selectedDice.filter(i => i !== index));
    } else {
      setSelectedDice([...selectedDice, index]);
    }
  };
  
  const bankScore = async () => {
    if (gameState !== "rolling" || !canBankScore) return;
    
    // Calculate score from selected dice
    const currentRollScore = calculateScore(selectedDice.map(index => dice[index]));
    const newTotalScore = totalScore + currentRollScore;
    setTotalScore(newTotalScore);
    setScore(0);
    
    // After first successful bank, reduce minimum score requirement
    if (totalScore === 0) {
      setMinScoreRequired(750);
    }
    
    // Check if game is over
    if (newTotalScore >= 10000) {
      endGame(true);
    } else {
      // Reset for next roll
      const newDice = Array(6).fill(0).map(() => Math.floor(Math.random() * 6) + 1);
      setDice(newDice);
      setHeldDice([]);
      setSelectedDice([]);
    }
  };

  const calculateScore = (selectedDiceValues: number[]): number => {
    if (selectedDiceValues.length === 0) return 0;
    
    let score = 0;
    
    // Check if all six dice have the same value (auto-win condition)
    if (selectedDiceValues.length === 6) {
      const firstValue = selectedDiceValues[0];
      const allSame = selectedDiceValues.every(value => value === firstValue);
      if (allSame) {
        // Automatic win - 10,000 points!
        return 10000;
      }
    }
    
    // Check for straight (1-2-3-4-5-6)
    if (selectedDiceValues.length === 6) {
      const sortedValues = [...selectedDiceValues].sort((a, b) => a - b);
      if (
        sortedValues[0] === 1 &&
        sortedValues[1] === 2 &&
        sortedValues[2] === 3 &&
        sortedValues[3] === 4 &&
        sortedValues[4] === 5 &&
        sortedValues[5] === 6
      ) {
        return 1500; // Straight = 1500 points
      }
    }
    
    // Count occurrences of each dice value
    const counts: { [key: number]: number } = {};
    selectedDiceValues.forEach(value => {
      counts[value] = (counts[value] || 0) + 1;
    });
    
    // Process counts for scoring
    Object.entries(counts).forEach(([value, count]) => {
      const numValue = parseInt(value);
      
      // Check for three or more of a kind
      if (count >= 3) {
        if (numValue === 1) {
          // Three 1s = 1000 points
          score += 1000;
          // Additional 1s beyond the first three
          if (count > 3) {
            score += (count - 3) * 100; // Each additional 1 is worth 100
          }
        } else if (numValue === 5) {
          // Three 5s = 500 points
          score += 500;
          // Additional 5s beyond the first three
          if (count > 3) {
            score += (count - 3) * 50; // Each additional 5 is worth 50
          }
        } else {
          // Three of any other number = value * 100
          score += numValue * 100;
          
          // Four of a kind = double value
          if (count === 4) {
            score += numValue * 100; // Double the three-of-a-kind score
          }
          // Five of a kind = triple value
          else if (count === 5) {
            score += numValue * 200; // Triple the three-of-a-kind score
          }
          // Six of a kind (should be caught by all-same check above, but just in case)
          else if (count === 6) {
            score += numValue * 300; // Quadruple the three-of-a-kind score
          }
        }
      } 
      // Individual 1s and 5s
      else {
        if (numValue === 1) {
          score += count * 100; // Each 1 is worth 100 points
        } else if (numValue === 5) {
          score += count * 50; // Each 5 is worth 50 points
        }
      }
    });
    
    return score;
  };
  
  const checkForFarkle = () => {
    if (!hasScoringDice) {
      showNotification("Farkle! No scoring dice, you lose all unbanked points!");
      endGame(false);
      return true;
    }
    return false;
  };
  
  const endGame = async (isWin: boolean) => {
    // Handle game outcome
    if (isWin) {
      // Player won
      setGameState("finished");
      
      const winAmount = currentBet * 2;
      const outcome = "win";
      
      // Record game history
      await apiRequest("POST", "/api/games/history", {
        gameType: GameType.DICE_10000,
        bet: currentBet,
        outcome: outcome,
        winAmount: winAmount
      });
      
      await updateBalance(winAmount);
      showNotification(`Congratulations! You've reached 10,000 points and won ${winAmount} credits!`);
      
      // Reset game after a delay
      setTimeout(() => {
        setGameState("betting");
        setDice([0, 0, 0, 0, 0, 0]);
        setHeldDice([]);
        setScore(0);
        setTotalScore(0);
        setSelectedDice([]);
        setRolls(0);
        setMinScoreRequired(1000);
      }, 3000);
    } else {
      // Player lost
      setGameState("finished");
      
      const winAmount = 0;
      const outcome = "loss";
      
      // Record game history
      await apiRequest("POST", "/api/games/history", {
        gameType: GameType.DICE_10000,
        bet: currentBet,
        outcome: outcome,
        winAmount: winAmount
      });
      
      showNotification("Game over! No scoring dice left. Better luck next time.");
      
      // Reset game after a delay
      setTimeout(() => {
        setGameState("betting");
        setDice([0, 0, 0, 0, 0, 0]);
        setHeldDice([]);
        setScore(0);
        setTotalScore(0);
        setSelectedDice([]);
        setRolls(0);
        setMinScoreRequired(1000);
      }, 3000);
    }
  };
  
  // Check for Farkle when new dice are rolled
  React.useEffect(() => {
    if (gameState === "rolling" && dice.length > 0 && rolls > 0 && selectedDice.length === 0) {
      setTimeout(() => {
        checkForFarkle();
      }, 1000);
    }
  }, [dice, rolls, gameState]);
  
  return (
    <main className="container mx-auto px-4 py-6 text-white">
      <div className="flex flex-wrap justify-between items-center mb-6">
        <h2 className="text-3xl font-montserrat font-bold text-[#F8BF0C] bg-gradient-to-r from-purple-700 to-pink-500 bg-clip-text text-transparent">
          10000 Dice Challenge
        </h2>
        <div className="flex space-x-3">
          <div className="bg-black bg-opacity-50 rounded-lg p-2 flex items-center">
            <span className="text-gray-300 mr-2">Balance:</span>
            <span className="text-[#F8BF0C] text-xl font-bold">{player.balance}</span>
            <span className="text-gray-300 ml-1">credits</span>
          </div>
        </div>
      </div>
      
      {/* Score Display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-r from-purple-900 to-pink-900 rounded-xl p-4 text-center shadow-lg border border-[#F8BF0C]">
          <h3 className="text-lg text-gray-300 mb-1">Total Score</h3>
          <div className="text-3xl font-bold text-[#F8BF0C]">{totalScore}</div>
          <div className="text-sm text-gray-400 mt-1">Goal: 10,000</div>
        </div>
        
        <div className="bg-gradient-to-r from-purple-900 to-pink-900 rounded-xl p-4 text-center shadow-lg border border-[#F8BF0C]">
          <h3 className="text-lg text-gray-300 mb-1">Current Roll Score</h3>
          <div className="text-3xl font-bold text-[#F8BF0C]">
            {selectedDice.length > 0 
              ? calculateScore(selectedDice.map(index => dice[index])) 
              : 0}
          </div>
          <div className="text-sm text-gray-400 mt-1">
            {totalScore === 0 
              ? `Need ${minScoreRequired} to get on board`
              : "Need 750 to bank"}
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-purple-900 to-pink-900 rounded-xl p-4 text-center shadow-lg border border-[#F8BF0C]">
          <h3 className="text-lg text-gray-300 mb-1">Dice Remaining</h3>
          <div className="text-3xl font-bold text-[#F8BF0C]">
            {dice.filter((v, i) => v > 0 && !heldDice.includes(i) && !selectedDice.includes(i)).length}
          </div>
          <div className="text-sm text-gray-400 mt-1">
            {dice.filter((v, i) => v > 0 && !heldDice.includes(i) && !selectedDice.includes(i)).length <= 2
              ? "Can bank if score is high enough"
              : "Need 2 or fewer to bank"}
          </div>
        </div>
      </div>
      
      {/* Dice Game */}
      <div className="bg-gradient-to-b from-[#331D5C] to-[#232131] rounded-xl p-6 shadow-lg">
        {gameState === "betting" ? (
          <div className="flex flex-col items-center justify-center py-8">
            <h3 className="text-2xl font-montserrat font-bold text-[#F8BF0C] mb-6">
              Ready to Roll?
            </h3>
            
            <div className="flex items-center bg-black bg-opacity-50 rounded-lg overflow-hidden mb-8">
              <span className="text-xl text-[#F8BF0C] font-bold px-4">BET:</span>
              <button 
                onClick={(e) => {
                  decreaseBet();
                  const btn = e.currentTarget as HTMLButtonElement;
                  btn.classList.add('btn-click');
                  setTimeout(() => {
                    btn.classList.remove('btn-click');
                  }, 100);
                }}
                className="bg-[#331D5C] hover:bg-purple-800 text-white px-5 py-4 focus:outline-none disabled:opacity-50 font-bold text-xl transition-transform"
              >
                -
              </button>
              <span className="px-8 py-4 font-sans text-[#F8BF0C] text-2xl font-bold">{currentBet}</span>
              <button 
                onClick={(e) => {
                  increaseBet();
                  const btn = e.currentTarget as HTMLButtonElement;
                  btn.classList.add('btn-click');
                  setTimeout(() => {
                    btn.classList.remove('btn-click');
                  }, 100);
                }}
                className="bg-[#331D5C] hover:bg-purple-800 text-white px-5 py-4 focus:outline-none disabled:opacity-50 font-bold text-xl transition-transform"
              >
                +
              </button>
            </div>
            
            <button 
              onClick={(e) => {
                startGame();
                const btn = e.currentTarget as HTMLButtonElement;
                btn.classList.add('btn-click');
                setTimeout(() => {
                  btn.classList.remove('btn-click');
                }, 100);
              }}
              disabled={player.balance < currentBet}
              className="bg-gradient-to-r from-[#F8BF0C] to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-[#232131] font-bold font-sans py-4 px-12 rounded-lg text-xl shadow-lg transition-all duration-300 transform hover:scale-105 focus:outline-none disabled:opacity-50"
            >
              <span className="font-bold tracking-wider">ROLL THE DICE</span>
            </button>
          </div>
        ) : (
          <>
            {/* Held dice display area */}
            {heldDice.length > 0 && (
              <div className="mb-4">
                <h3 className="text-lg font-bold text-[#F8BF0C] mb-2">Held Dice:</h3>
                <div className="bg-black bg-opacity-50 rounded-lg p-4">
                  <div className="flex flex-wrap gap-4 justify-center">
                    {heldDice.map((index) => (
                      <div 
                        key={`held-${index}`} 
                        className="w-16 h-16 md:w-20 md:h-20 flex items-center justify-center rounded-xl bg-white text-[#232131] opacity-70"
                      >
                        <div className="text-3xl md:text-4xl font-bold">
                          {dice[index]}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {/* Active dice display area */}
            <div className="bg-black bg-opacity-50 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-bold text-[#F8BF0C] mb-2">
                {selectedDice.length > 0 ? "Selected Dice:" : "Roll the Dice:"}
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 justify-items-center">
                {dice.map((value, index) => (
                  (value > 0 && !heldDice.includes(index)) && (
                    <div 
                      key={`dice-${index}`} 
                      className={`w-16 h-16 md:w-20 md:h-20 flex items-center justify-center rounded-xl cursor-pointer transition-all transform ${
                        selectedDice.includes(index) 
                          ? 'bg-white text-[#232131] scale-110 shadow-[0_0_15px_rgba(248,191,12,0.7)]' 
                          : 'bg-[#331D5C] hover:bg-purple-800 hover:scale-105 text-white'
                      }`}
                      onClick={() => toggleDiceSelection(index)}
                    >
                      <div className="text-3xl md:text-4xl font-bold">
                        {value}
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>
            
            {/* Game info */}
            <div className="bg-black bg-opacity-30 rounded-lg p-4 mb-6">
              {selectedDice.length > 0 ? (
                <div className="text-center">
                  <div className="text-lg text-gray-300">
                    Selected Dice Score: <span className="text-[#F8BF0C] font-bold">{calculateScore(selectedDice.map(index => dice[index]))}</span>
                  </div>
                  
                  {canBankScore ? (
                    <div className="mt-2 text-green-400">
                      You can bank this score!
                    </div>
                  ) : (
                    <div className="mt-2 text-gray-400">
                      {dice.filter((v, i) => v > 0 && !heldDice.includes(i) && !selectedDice.includes(i)).length > 2 ?
                        "You need 2 or fewer dice remaining to bank." :
                        totalScore === 0 ?
                          `You need ${minScoreRequired} points to get on the board.` :
                          "You need at least 750 points to bank."
                      }
                    </div>
                  )}
                  
                  {selectedDice.length === 6 && calculateScore(selectedDice.map(index => dice[index])) === 10000 && (
                    <div className="mt-2 text-xl text-[#F8BF0C] font-bold animate-pulse">
                      Wow! You've got a winning combination!
                    </div>
                  )}
                  {selectedDice.length === 6 && calculateScore(selectedDice.map(index => dice[index])) === 1500 && (
                    <div className="mt-2 text-xl text-[#F8BF0C] font-bold">
                      Nice! You've got a straight (1-2-3-4-5-6)!
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-300">
                  <p className="mb-2">Select at least one scoring die:</p>
                  <ul className="inline-block text-left text-sm">
                    <li>• Each 1 = 100 points</li>
                    <li>• Each 5 = 50 points</li>
                    <li>• Three of a kind ("Tripz") = scoring combo</li>
                  </ul>
                </div>
              )}
            </div>
            
            {/* Controls */}
            <div className="flex justify-center space-x-6">
              <button 
                onClick={(e) => {
                  if (selectedDice.length === 0) {
                    showNotification("You must select at least one die before rolling again!");
                    return;
                  }
                  
                  rollDice();
                  if (gameState === "rolling") {
                    const btn = e.currentTarget as HTMLButtonElement;
                    btn.classList.add('btn-click');
                    setTimeout(() => {
                      btn.classList.remove('btn-click');
                    }, 100);
                  }
                }}
                disabled={gameState !== "rolling" || selectedDice.length === 0}
                className="bg-gradient-to-r from-[#2E86DE] to-[#1A7A4C] hover:from-blue-700 hover:to-green-700 text-white font-sans py-3 px-8 rounded-lg text-lg shadow-lg transition-all duration-300 transform hover:scale-105 focus:outline-none disabled:opacity-50"
              >
                ROLL AGAIN
              </button>
              <button 
                onClick={(e) => {
                  bankScore();
                  if (gameState === "rolling" && canBankScore) {
                    const btn = e.currentTarget as HTMLButtonElement;
                    btn.classList.add('btn-click');
                    setTimeout(() => {
                      btn.classList.remove('btn-click');
                    }, 100);
                  }
                }}
                disabled={gameState !== "rolling" || !canBankScore}
                className="bg-gradient-to-r from-[#F8BF0C] to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-[#232131] font-bold font-sans py-3 px-8 rounded-lg text-lg shadow-lg transition-all duration-300 transform hover:scale-105 focus:outline-none disabled:opacity-50"
              >
                BANK SCORE
              </button>
            </div>
          </>
        )}
      </div>
      
      {/* Rules */}
      <div className="mt-6 bg-gradient-to-r from-[#331D5C] to-[#232131] rounded-xl p-6 shadow-lg">
        <h3 className="text-xl font-montserrat font-semibold mb-3 text-[#F8BF0C] bg-gradient-to-r from-purple-700 to-pink-500 bg-clip-text text-transparent">Game Rules</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-[#F8BF0C] mb-2 font-semibold">Basic Scoring</h4>
            <ul className="list-disc pl-5 text-gray-300 text-sm space-y-1">
              <li>Goal: Be the first to score 10,000 points</li>
              <li>Need 1000+ points to get on board first time</li>
              <li>Need 750+ points to bank after that</li>
              <li>Each 1 = 100 points</li>
              <li>Each 5 = 50 points</li>
              <li>Three 1's = 1,000 points</li>
              <li>Three 5's = 500 points</li>
              <li>Three of a kind (except 1's and 5's) = value × 100</li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-[#F8BF0C] mb-2 font-semibold">Game Rules</h4>
            <ul className="list-disc pl-5 text-gray-300 text-sm space-y-1">
              <li>Must select at least one die each roll</li>
              <li>Can only bank with 2 or fewer dice remaining</li>
              <li>Six of a kind = Automatic win (10,000 points)</li>
              <li>Straight (1-2-3-4-5-6) = 1,500 points</li>
              <li>No scoring dice = "Farkle" - lose all unbanked points</li>
              <li>Max 6 players can play in turn-based mode</li>
              <li>Must score enough points to meet minimum threshold</li>
            </ul>
            
            <div className="bg-black bg-opacity-30 rounded-lg p-3 mt-3">
              <p className="text-sm text-gray-300">
                <span className="text-[#F8BF0C]">Tip:</span> Choose your dice wisely! It's often better to bank a smaller score than risk losing everything.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}