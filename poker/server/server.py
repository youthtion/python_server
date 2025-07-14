from flask import Flask, request, jsonify, send_from_directory
from enum import Enum, IntEnum
import random
import threading
app = Flask(__name__, static_folder="../client")

RANKS = 13

class HandRank(IntEnum):
    HIGH_CARD = 0
    ONE_PAIR = 1
    TWO_PAIR = 2
    THREE_OF_A_KIND = 3
    STRAIGHT = 4
    FLUSH = 5
    FULL_HOUSE = 6
    FOUR_OF_A_KIND = 7
    STRAIGHT_FLUSH = 8

class EStatus(Enum):
    MATCH = 0
    DEAL = 1
    CHANGE = 2
    COMPARE = 3

class ESuit(Enum):
    CLUB = 0
    DIAMOND = 1
    HEART = 2
    SPADE = 3

class EResult(Enum):
    LOSE = 0
    WIN = 1
    DRAW = 2

Game = {}
PlayerCount = 0
Lock = threading.Lock()

def newDeck():
    deck = [s * RANKS + r for s in range(len(ESuit)) for r in range(RANKS)]
    random.shuffle(deck)
    return deck

def drawHand(_deck, _cnt):
    return [_deck.pop() for _ in range(_cnt)]

@app.route("/join", methods = ["POST"])
def join():
    global PlayerCount
    with Lock:
        PlayerCount += 1
        player_id = PlayerCount
        game_id = (player_id - 1) // 2 + 1
        if game_id not in Game:
            Game[game_id] = {
                "status":EStatus.MATCH,
                "deck":newDeck(),
                "hand":[[], []],
                "new_hand":[[], []]
            }
        return jsonify({"player_id":player_id})

@app.route("/status", methods = ["GET"])
def status():
    player_id = int(request.args.get("player_id", "0"))
    game_id = (player_id - 1) // 2 + 1
    print(f"gameid:{game_id} sta:{Game[game_id]['status']}")
    if Game[game_id]["status"] == EStatus.MATCH:
        return match(player_id)
    elif Game[game_id]["status"] == EStatus.COMPARE:
        return compare(player_id)
    else:
        return jsonify({})

def match(_player_id):
    global Game
    if _player_id % 2 == 0 or _player_id + 1 <= PlayerCount:
        return jsonify({"status":EStatus.DEAL.name})
    return jsonify({})

def compare(_player_id):
    game_id = (_player_id - 1) // 2 + 1
    pid = _player_id % 2
    rid = 1 if pid == 0 else 0
    hand = Game[game_id]["new_hand"][pid]
    rival_hand = Game[game_id]["new_hand"][rid]
    compare = compare_hands(hand, rival_hand)
    return jsonify({"status":EStatus.COMPARE.name, "hand":hand, "rival_hand":rival_hand, "compare":compare})

@app.route("/deal", methods = ["POST"])
def deal():
    data = request.get_json()
    player_id = data.get("player_id")
    if player_id is None:
        return jsonify({}), 400
    game_id = (player_id - 1) // 2 + 1
    pid = player_id % 2
    global Game
    if game_id not in Game or len(Game[game_id]["hand"][pid]) != 0:
        return jsonify({}), 400
    with Lock:
        cards = drawHand(Game[game_id]["deck"], 5)
        Game[game_id]["hand"][pid] = encodeHand(cards)
        if len(Game[game_id]["hand"][0]) > 0 and len(Game[game_id]["hand"][1]) > 0:
            Game[game_id]["status"] = EStatus.CHANGE
        return jsonify({"hand":Game[game_id]["hand"][pid]})

@app.route("/change", methods = ["POST"])
def change():
    data = request.get_json()
    player_id = data.get("player_id")
    select = data.get("select", [])
    if player_id is None or not isinstance(select, list) or not all(0 <= i < 5 for i in select):
        return jsonify({}), 400
    game_id = (player_id - 1) // 2 + 1
    pid = player_id % 2
    global Game
    if game_id not in Game or Game[game_id]["status"] != EStatus.CHANGE or len(Game[game_id]["new_hand"][pid]) > 0:
        return jsonify({}), 400
    with Lock:
        deck = Game[game_id]["deck"]
        current_hand = Game[game_id]["hand"][pid]
        cards = []
        for rank in range(RANKS):
            for suit in range(len(ESuit)):
                if (current_hand[suit] >> rank) & 1:
                    cards.append(suit * RANKS + rank)
        kept_cards = [cards[i] for i in range(len(cards)) if i not in select]
        new_cards = drawHand(deck, len(select))
        new_hand = encodeHand(kept_cards + new_cards)
        Game[game_id]["new_hand"][pid] = new_hand
        if len(Game[game_id]["new_hand"][0]) > 0 and len(Game[game_id]["new_hand"][1]) > 0:
            Game[game_id]["status"] = EStatus.COMPARE
        return jsonify({"hand": new_hand})

def encodeHand(_cards):
    hand = [0 for _ in range(len(ESuit))]
    for card in _cards:
        suit = card // RANKS
        rank = card % RANKS
        hand[suit] |= (1 << rank) #AKQJX98765432
    return hand

def evaluate_hand(hand):
    result = {
        "rank_value": HandRank.HIGH_CARD,
        "main": -1,
        "main_suit": -1
    }
    #判斷順
    rank_only = hand[0] | hand[1] | hand[2] | hand[3]
    straight = False
    straight_high = -1
    for i in range(9):
        if (rank_only >> i) & 0b11111 == 0b11111:
            straight = True
            straight_high = i + 4
            break
    if (rank_only & 0b1000000001111) == 0b1000000001111:
        straight = True
        straight_high = 3

    #牌點統計
    flush_suit = -2
    rank_count = [0] * RANKS
    for s in range(len(ESuit)):
        if hand[s] > 0:
            if flush_suit == -2:
                flush_suit = s
            else:
                flush_suit = -1
        for r in range(RANKS):
            if hand[s] & (1 << r):
                rank_count[r] += 1

    if flush_suit >= 0 and straight:
        result["rank_value"] = HandRank.STRAIGHT_FLUSH
        result["main"] = straight_high
        result["main_suit"] = flush_suit
    elif 4 in rank_count:
        result["rank_value"] = HandRank.FOUR_OF_A_KIND
        result["main"] = rank_count.index(4)
    elif 3 in rank_count and 2 in rank_count:
        result["rank_value"] = HandRank.FULL_HOUSE
        result["main"] = rank_count.index(3)
    elif flush_suit >= 0:
        result["rank_value"] = HandRank.FLUSH
        result["main"] = max(r for r in range(RANKS) if hand[flush_suit] & (1 << r))
        result["main_suit"] = flush_suit
    elif straight:
        result["rank_value"] = HandRank.STRAIGHT
        result["main"] = straight_high
        result["main_suit"] = max(s for s in range(len(ESuit)) if hand[s] & (1 << result["main"]))
    elif 3 in rank_count:
        result["rank_value"] = HandRank.THREE_OF_A_KIND
        result["main"] = rank_count.index(3)
    elif rank_count.count(2) == 2:
        result["rank_value"] = HandRank.TWO_PAIR
        result["main"] = max(r for r, c in enumerate(rank_count) if c == 2)
        result["main_suit"] = max(s for s in range(len(ESuit)) if hand[s] & (1 << result["main"]))
    elif 2 in rank_count:
        result["rank_value"] = HandRank.ONE_PAIR
        result["main"] = rank_count.index(2)
        result["main_suit"] = max(s for s in range(len(ESuit)) if hand[s] & (1 << result["main"]))
    else:
        result["rank_value"] = HandRank.HIGH_CARD
        result["main"] = max(r for r in range(RANKS) if rank_only & (1 << r))
        result["main_suit"] = max(s for s in range(len(ESuit)) if hand[s] & (1 << result["main"]))
    return result

def compare_hands(handA, handB):
    evaA = evaluate_hand(handA)
    evaB = evaluate_hand(handB)
    if evaA["rank_value"] != evaB["rank_value"]:
        return evaA["rank_value"] - evaB["rank_value"]
    if evaA["main"] != evaB["main"]:
        return evaA["main"] - evaB["main"]
    return evaA["main_suit"] - evaB["main_suit"]

@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory(app.static_folder, path)

if __name__ == "__main__":
    app.run(debug = True, port = 8000)
