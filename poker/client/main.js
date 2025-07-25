const EHandType = {
    PLAYER:0,
    RIVAL:1
};

const ESuit = {
    CLUB:0,
    DIAMOND:1,
    HEART:2,
    SPADE:3
};

const EHandRank = {
    HIGH_CARD:0,
    PAIR:1,
    TWO_PAIR:2,
    THREE_OF_A_KIND:3,
    STRAIGHT:4,
    FLUSH:5,
    FULL_HOUSE:6,
    FOUR_OF_A_KIND:7,
    STRAIGHT_FLUSH:8
};

const suits = ["♣", "♦", "♥", "♠"];
const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

let playerId = null;
let checkStatusInterval = null;
let playerHand = [];
let rivalHand = [];
let selectIds = [];

async function joinGame(){
    let res = await fetch("/join", { method : "POST" });
    if(res.ok){
    let data = await res.json();
    playerId = data.player_id;
    if(playerId && playerId > 0){
        checkStatusInterval = setInterval(checkStatus, 2000);
    }
    }
}

async function checkStatus(){
    let res = await fetch("/status?player_id=" + playerId);
    if(res.ok){
    let data = await res.json();
    let game_status = data.status;
    if(game_status && checkStatusInterval){
        clearInterval(checkStatusInterval);
        checkStatusInterval = null;
        setGameStatus(game_status, data);
    }
    }
}

function setGameStatus(_status, _data){
    if(_status == "DEAL"){
    dealCards();
    }
    else if(_status == "COMPARE"){
    compareCards(_data);
    }
}

async function dealCards(){
    let res = await fetch("/deal", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({player_id:playerId})
    });
    if(res.ok){
    let data = await res.json();
    if(data.hand && Array.isArray(data.hand) && data.hand.length === 4){
        playerHand = [...data.hand];
        showCards(EHandType.PLAYER);
        setEventAct(true);
        document.getElementById("status").innerHTML = "選擇換牌或跳過";
        document.getElementById("changeBtn").style.display = "block";
    }
    }
}

function compareCards(_data){
    if(_data.hand && Array.isArray(_data.hand) && _data.hand.length === 4 && _data.rival_hand && Array.isArray(_data.rival_hand) && _data.rival_hand.length === 4 && _data.compare){
    playerHand = [..._data.hand];
    rivalHand = [..._data.rival_hand];
    showCards(EHandType.PLAYER);
    showCards(EHandType.RIVAL);
    document.getElementById("status").innerHTML = _data.compare > 0 ? "WIN" : "LOSE";
    document.getElementById("restartBtn").style.display = "block";
    }
}

async function changeCards(){
    let res = await fetch("/change", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
        player_id:playerId,
        select:selectIds
    })
    });
    if(res.ok){
    let data = await res.json();
    if(data.hand && Array.isArray(data.hand) && data.hand.length === 4){
        playerHand = [...data.hand];
        showCards(EHandType.PLAYER);
        setEventAct(false);
        document.getElementById("status").innerHTML = "等待對手換牌...";
        document.getElementById("changeBtn").style.display = "none";
        checkStatusInterval = setInterval(checkStatus, 2000);
    }
    }
}

function showCards(_type){
    let cards = decodeHand(_type == EHandType.PLAYER ? playerHand : rivalHand);
    for(let i = 0; i < 5; i++){
    let card = Math.round(cards[i]);
    let rank = card % ranks.length;
    let suit = Math.round((card - rank) / ranks.length);
    let div = document.getElementById((_type == EHandType.PLAYER ? "p_card" : "r_card") + i);
    div.innerHTML = suits[suit] + ranks[rank];
    div.style.color = suit > ESuit.CLUB && suit < ESuit.SPADE ? "red" : "black";
    div.classList.remove("selected");
    }
    let hand_rank_text = document.getElementById(_type == EHandType.PLAYER ? "player_handrank" : "rival_handrank");
    let hand_rank = evaluateHandRank(_type == EHandType.PLAYER ? playerHand : rivalHand);
    switch(hand_rank){
    case EHandRank.STRAIGHT_FLUSH:
        hand_rank_text.innerHTML = "同花順"
        break;
    case EHandRank.FOUR_OF_A_KIND:
        hand_rank_text.innerHTML = "鐵支"
        break;
    case EHandRank.FULL_HOUSE:
        hand_rank_text.innerHTML = "葫蘆"
        break;
    case EHandRank.FLUSH:
        hand_rank_text.innerHTML = "同花"
        break;
    case EHandRank.STRAIGHT:
        hand_rank_text.innerHTML = "順"
        break;
    case EHandRank.THREE_OF_A_KIND:
        hand_rank_text.innerHTML = "三條"
        break;
    case EHandRank.TWO_PAIR:
        hand_rank_text.innerHTML = "兩對"
        break;
    case EHandRank.PAIR:
        hand_rank_text.innerHTML = "一對"
        break;
    case EHandRank.HIGH_CARD:
        hand_rank_text.innerHTML = "高牌"
        break;
    }
}

function setEventAct(_available)
{
    for(let i = 0; i < 5; i++){
    let div = document.getElementById("p_card" + i);
    if(_available == true){
        div.onclick = () => selectKeep(i);
    }
    else{
        div.onclick = null;
    }
    }
}

function decodeHand(_hand)
{
    let cards = [];
    for(let rank = 0; rank < ranks.length; rank++){
    for(let suit = 0; suit < _hand.length; suit++){
        let bits = _hand[suit];
        if((bits >> rank) & 1){ //AKQJX98765432
        cards.push(suit * ranks.length + rank);
        }
    }
    }
    return cards;
}

function evaluateHandRank(_hand)
{
    //判斷順
    let straight = false;
    let rank_only = _hand[0] | _hand[1] | _hand[2] | _hand[3];
    for(let i = 0; i <= 8; i++){
    if((rank_only & (0b11111 << i)) === (0b11111 << i)){
        straight = true;
        break;
    }
    }
    //特例:A2345
    if((rank_only & 0b1000000001111) === 0b1000000001111){
    straight = true;
    }

    //牌點統計
    let flush = false;
    let suit_count = 0;
    let rank_count = Array(ranks.length).fill(0);
    for(let i = 0; i < suits.length; i++){
    if(_hand[i] > 0){
        suit_count++;
    }
    for(let r = 0; r < ranks.length; r++){
        if(_hand[i] & (1 << r)){
        rank_count[r]++;
        }
    }
    }
    if(suit_count === 1){
    flush = true;
    }

    //判斷牌型
    let counts = rank_count.filter(x => x > 0);
    if(flush && straight){
    return EHandRank.STRAIGHT_FLUSH;
    }
    if(counts.includes(4)){
    return EHandRank.FOUR_OF_A_KIND;
    }
    if(counts.includes(3) && counts.includes(2)){
    return EHandRank.FULL_HOUSE;
    }
    if(flush){
    return EHandRank.FLUSH;
    }
    if(straight){
    return EHandRank.STRAIGHT;
    }
    if(counts.includes(3)){
    return EHandRank.THREE_OF_A_KIND;
    }
    if(counts.filter(c => c === 2).length === 2){
    return EHandRank.TWO_PAIR;
    }
    if(counts.includes(2)){
    return EHandRank.PAIR;
    }
    return EHandRank.HIGH_CARD;
}

function initialUI()
{
    let r_container = document.getElementById("rival_cards");
    let p_container = document.getElementById("player_cards");
    for (let i = 0; i < 5; i++) {
    let r_id = "r_card" + i;
    let r_div = document.getElementById(r_id);
    if (!r_div) {
        r_div = document.createElement("div");
        r_div.className = "card";
        r_div.id = r_id;
        r_container.appendChild(r_div);
    }
    r_div.innerText = "?";
    r_div.style.color = "black";

    let p_id = "p_card" + i;
    let p_div = document.getElementById(p_id);
    if (!p_div) {
        p_div = document.createElement("div");
        p_div.className = "card";
        p_div.id = p_id;
        p_container.appendChild(p_div);
    }
    p_div.innerHTML = "";
    }
    document.getElementById("status").innerHTML = "等待配對...";
    document.getElementById("rival_handrank").innerHTML = "&nbsp";
    document.getElementById("player_handrank").innerHTML = "&nbsp";
    document.getElementById("changeBtn").style.display = "none";
    document.getElementById("restartBtn").style.display = "none";
}

function selectKeep(id)
{
    let div = document.getElementById("p_card" + id);
    let idx = selectIds.indexOf(id);
    if(idx === -1) {
    div.classList.add("selected");
    selectIds.push(id);
    }
    else{
    div.classList.remove("selected");
    selectIds.splice(idx, 1);
    }
}

function restart()
{
    playerId = null;
    checkStatusInterval = null;
    playerHand = [];
    rivalHand = [];
    selectIds = [];
    initialUI();
    joinGame();
}
restart();