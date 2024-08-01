// ==UserScript==
// @name         Fast Ads3
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Gotta go fast!
// @author       wmol4
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-body
// @noframes
// ==/UserScript==

let debounceTimer;
let adOpacity = '0.1';
let playbackRate = 2;
let adObserver = null;
let intervalID1 = null;
let intervalID2 = null;
let playerElem;
let videoElement;
let keepChecking;
let skipTime = 1.5;
let wasMutedByAd = false;
let originalMuteState = false;
let intervalID = null;
let lastInvocation = 0;
let domChanges = true;
const observationThresh = 100;
const checkInterval = 1000

// NOTE
// document.querySelector('[class*="ad-duration-remaining"]')

let timeFormatter = new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'numeric',second:'numeric',hour12:false});
let lastLogTime = null;
function log(string) {
    let currentTime = new Date();
    let timeString = '';
    if (!lastLogTime || (currentTime - lastLogTime) >= (10*1000)) {
        //Only log the timestamp if it has been at least 10 seconds since the last timestamped message
        timeString = `${timeFormatter.format(currentTime)}: `;
        lastLogTime = currentTime;
    }
    console.log(`[Fast Ads] ${timeString}${string}`);
}

function hasAnyClass(element, classes, print=true) {
    const foundClasses = classes.filter(cls => element.classList.contains(cls));

    if (foundClasses.length > 0) {
        if (print) { log(`Found ${foundClasses.join(', ')}`); }
        return true;
    }
    return false;
}

function checkPlayerAdClass(playerElement, print) { // First Check
    // Check if the player has class attributes "ad-interrupting" or "ad-showing"
    return hasAnyClass(playerElement, ['ad-interrupting', 'ad-showing'], print);
}

function hasAnyChildren(parentElement, mySelectorsList, print=true) {
    const foundSelectors = [];
    const allElements = parentElement.querySelectorAll(mySelectorsList.join(","));

    for (const element of allElements) {
        for (const selector of mySelectorsList) {
            if (element.matches(selector) && !foundSelectors.includes(selector)) {
                foundSelectors.push(selector);
                break; // No need to check other selectors for this element
            }
        }
    }

    if (foundSelectors.length > 0) {
        if (print) { log(`Found: ${foundSelectors.join(", ")}`); }
        return true;
    }
    return false;
}

function checkPlayerAdChildren(playerElement, print) {
    return hasAnyChildren(playerElement, ["[class*='ad-player-overlay']", "[class*='ytp-flyout-cta']"], print);
}

function checkPlayerDisabledProgressBar(playerElement, print=true) {
    let progressBarContainer = playerElement.querySelector("[class*='ytp-progress-bar-container']");
    let isDisabled;
    if (progressBarContainer) {
        if (progressBarContainer.hasAttribute('disabled')) {
            isDisabled = progressBarContainer.getAttribute('disabled') !== 'false';
            if (isDisabled) {
                if (print) { log('Progress Bar attribute "disabled" is "true".'); }
                return true;
            }
        }
    }
    return false;
}

function checkPlayerUndraggableProgressBar(playerElement, print=true) {
    let progressBar = playerElement.querySelector("[class='ytp-progress-bar']")
    if (progressBar && progressBar.hasAttribute('draggable')) {
        const isDraggable = progressBar.getAttribute('draggable');
        if (!isDraggable) {
            if (print) { log('Progress Bar attribute "draggable" is "false".'); }
            return true;
        }
    }
}

function checkPlayerAdProgressBarVisibility(playerElement, print=true) {
    let element = playerElement.querySelector("[class*='ad-persistent-progress']")
    if (element) {
        let computedStyle = window.getComputedStyle(element);
        if (computedStyle.display !== 'none') {
            if (print) { log('Progress Bar "ad-persistent-progress" is visible.'); }
            return true;
        }
    }
    return false;
}

function checkPlayerProgressBar(playerElement, print) {
    let check0 = checkPlayerDisabledProgressBar(playerElement, print);
    if (check0) { return true; }
    let check1 = checkPlayerUndraggableProgressBar(playerElement, print);
    if (check1) { return true; }
    let check2 = checkPlayerAdProgressBarVisibility(playerElement, print);
    if (check2) { return true; }
    return false;
}

function IDUrl(url) {
    if (url.hostname.includes('youtube.com')) {
        return url.searchParams.get('v');
    } else if (url.hostname.includes('youtu.be')) {
        return url.pathname.split('/')[1];
    }
    return null;
}

function ID0() {
    return IDUrl(new URL(document.location.href));
}

function ID1(playerElement) {
    return IDUrl(new URL(playerElement.getVideoUrl()));
}

function ID2(playerElement) {
    return playerElement.getVideoData().video_id;
}

function checkIDMismatch(playerElement, print) {
    const IDs = [ID0(), ID1(playerElement), ID2(playerElement)].filter(id => id != null);
    if (IDs.length == 0 || IDs.every((id, _, array) => id === array[0])) {
        return false;
    }
    if (print) {
        log(`URL ID: ${IDs[0]}`);
        log(`Player ID: ${IDs[1]}`);
        log(`Video ID: ${IDs[2]}`);
    }
    return true;
}

function checkAdPlaying(playerElement, print=false) {
    if (!playerElement) return false;
    let indicator0 = checkPlayerAdClass(playerElement, print);
    if (indicator0) return true;
    let indicator1 = checkIDMismatch(playerElement, print);
    if (indicator1) return true;
    let indicator2 = checkPlayerProgressBar(playerElement, print);
    if (indicator2) return true;
    let indicator3 = checkPlayerAdChildren(playerElement, print);
    if (indicator3) return true;
    return false;
}

function isVideoVisible(element, minWidth = 100, minHeight = 100) {
    if (!element) return false;

    function isAncestorVisibleAndNotClipping(elem, childRect) {
        if (elem === document.body) return true;
        const styles = window.getComputedStyle(elem);

        // Check visibility
        if (styles.display === 'none' || styles.visibility === 'hidden' || styles.opacity < adOpacity) {
            return false;
        }

        // Check for potential clipping
        if (styles.overflow !== 'visible') {
            const parentRect = elem.getBoundingClientRect();
            if (childRect.bottom > parentRect.bottom || childRect.top < parentRect.top ||
                childRect.right > parentRect.right || childRect.left < parentRect.left) {
                return false;
            }
        }

        return isAncestorVisibleAndNotClipping(elem.parentElement, childRect);
    }

    const styles = window.getComputedStyle(element);
    if (styles.display === 'none' || styles.visibility === 'hidden' || styles.opacity < adOpacity) {
        return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < minWidth || rect.height < minHeight) {
        return false;
    }

    if (rect.top >= window.innerHeight || rect.bottom <= 0 ||
        rect.left >= window.innerWidth || rect.right <= 0) {
        return false;
    }

    return isAncestorVisibleAndNotClipping(element.parentElement, rect);
}

function isVideoPlaying(videoElement) {
    return (videoElement && !videoElement.paused && !videoElement.ended);// && videoElement.currentTime > 0);
}

function checkSkippable(playerElement, videoElement, print=true) {
    // Final (overly) comprehensive check before actually skipping
    // Only skip if a video is visible, playing, and is an ad
    let cond0 = isVideoPlaying(videoElement);
    if (!cond0) return false;
    let cond1 = checkAdPlaying(playerElement, print);
    if (!cond1) return false;
    let cond2 = isVideoVisible(videoElement);
    if (!cond2) return false;
    return true;
}

function vidAdCheck() {
    return checkAdPlaying(playerElem, false);
}

function getVideos() {
    return document.querySelectorAll('video');
}

function skipVid(videoElement) {
    let skipTo = 0.5
    videoElement.currentTime = videoElement.duration-skipTo;
    log(`Ad Found. Skipped ${videoElement.duration}s`);

//     let origPlaybackRate = videoElement.playbackRate;
//     videoElement.playbackRate = playbackRate;
//     setTimeout(() => {
//         videoElement.playbackRate = origPlaybackRate;
//         if (!document.body.classList.contains('efyt-mini-player')) {
//             document.body.classList.add('efyt-mini-player');
//             document.body.classList.remove('efyt-mini-player');
//         }
//         //videoElement.load();
//     }, 1000 * (skipTo/playbackRate));
}


function adPlaying(videoElement) {
    if (!videoElement.muted) {
        originalMuteState = videoElement.muted;
        videoElement.muted = true;
        wasMutedByAd = true;
    }
    if (videoElement.style.opacity === '1') {
        videoElement.style.opacity = adOpacity;
    }
    if (playerElem && playerElem.style.opacity === '1') {
        playerElem.style.opacity = adOpacity;
    }
//     if (!intervalID) {
//         intervalID = setInterval(clickSkipButton, 250);
//     }
}

function adNotPlaying(videoElement) {
    if (wasMutedByAd) {
        videoElement.muted = originalMuteState;
        wasMutedByAd = false;
    }
    if (videoElement.style.opacity !== '1') {
        videoElement.style.opacity = '1';
    }
    if (playerElem && playerElem.style.opacity !== '1') {
        playerElem.style.opacity = '1';
    }
//     if (isVideoPlaying(videoElement) && intervalID) {
//         clearInterval(intervalID);
//         intervalID = null;
//     }
}


function checkAndSkip(playerElement) {
    // this function is called every interval1 after a play starts
    const currentTime = videoElement.currentTime;
    if (vidAdCheck()) { // ad playing
        adPlaying(videoElement);
        if ((currentTime >= skipTime) && keepChecking && checkSkippable(playerElement, videoElement, true)) {
            skipVid(videoElement);
            keepChecking = false;
            clearInterval(intervalID1);
            intervalID1 = null;
        }

    } else { // ad not playing
        adNotPlaying(videoElement);
        if ((currentTime >= skipTime) && keepChecking) {
            keepChecking = false;
            clearInterval(intervalID1);
            intervalID1 = null;
        }
    }
}

function vidAdSkip() {
    if (!intervalID1) { // start checking periodically
        keepChecking = true;
        intervalID1 = setInterval(() => {
            checkAndSkip(playerElem);
        }, 100);
    }
}

let userClickEvent = null;
document.addEventListener('click', function(event) {
    if (!userClickEvent) {
        userClickEvent = event;
        //log('Click event stored');
    }
});

function autoClick(element) {
    if (userClickEvent) {
        element.dispatchEvent(userClickEvent);
    } else {
        //log("User hasn't clicked yet!");
    }
}

let clicking = false;
function clickSkipButton() {
    if (!userClickEvent || clicking) {
        return;
    }
    const skipButtonSelector = 'button[class*="ad-skip"]';
    const skipButtons = document.querySelectorAll(skipButtonSelector);
    const uniqueButtons = new Set(skipButtons);

    uniqueButtons.forEach(button => {
        //if (!clicking && !button.disabled && isVideoVisible(button, 10, 10) && button.innerText.toLowerCase().includes('skip') && !/\d/.test(button.innerText)) {
        if (!clicking && !button.disabled) {
            clicking = true;
            const buttonContent = button.textContent;
            setTimeout(() => {
                autoClick(button);
                log(`Clicked "${buttonContent}" button`);
                clicking = false;
            }, 100);
        }
    });
}
setInterval(clickSkipButton, 250);

function seekEvent(e) {
    // Ensure the event doesn't fire in input fields
    if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea') {
        return;
    }
    const video = document.querySelector('video');
    if (!video) return;

    // A and D seek back/forward 30s
    // Q and E seek back/forward 60s
    // S seeks back 0.001s (to try and fix a loading issue)
    let amtSeeked;
    let seeked = false;
    switch (e.key.toLowerCase()) {
        case 'a': // seeking backwards 30s
            amtSeeked = -30;
            seeked = true;
            break;
        case 'd': // seeking forward 30s
            amtSeeked = 30
            seeked = true;
            break;
        case 'q': // seeking backwards 60s
            amtSeeked = -60
            seeked = true;
            break;
        case 'e': // seeking forward 60s
            amtSeeked = 60
            seeked = true;
            break;
        case 's': // video fix attempt
            amtSeeked = -0.001
            seeked = true;
            break;
    }
    if (seeked) {
        video.currentTime += amtSeeked;
        log(`Seeked ${amtSeeked}s`);
    }
}

function isElementVisible(element) {
    if (!element) return false;
    return isVideoVisible(element);

    const styles = window.getComputedStyle(element);
    if (styles.display === 'none' || styles.visibility === 'hidden') {// || parseFloat(styles.opacity) < 0.1) {
        return false;
    }
    return true;
}

function getPermutationsOfPairs(arr) {
    let result = [];
    for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr.length; j++) {
            if (i !== j) {
                result.push([arr[i], arr[j]]);
            }
        }
    }
    return result;
}

let seps = ['-', ' '];
let perms = getPermutationsOfPairs(seps);
function generateSelectors(strings, attributes) {
    const selectors = [];

    strings.forEach(str => {
        attributes.forEach(attr => {
            perms.forEach(perm => {
                selectors.push(`[${attr}*="${perm[0]}${str}${perm[1]}"]`);
            });
            seps.forEach(sep => {
                selectors.push(`[${attr}^="${str}${sep}"]`);
                selectors.push(`[${attr}$="${sep}${str}"]`);
                selectors.push(`[${attr}*="${sep}${str}${sep}"]`);
            });
        });
    });

    return selectors;
}

// Manual selectors
const adSelectors = [
    '[class*="paid"][class*="overlay"]',
    '[class*="ytp-button"][aria-label*="products"]',
    ':where([class*="popup"]:has([id*="promo-renderer"]))',
];
// Generated selectors
const inputStrings = ['ad', 'ads', 'banner', 'brand', 'branding', 'merch', 'promo', 'teaser'];
const attributes = ['class', 'id', 'target-id']
const outputSelectors = generateSelectors(inputStrings, attributes);
const allSelectors = Array.from(new Set([...outputSelectors, ...adSelectors]));
// Combined selectors
const adSelectorString = allSelectors.join(',');

function getElementSelector(element) {
    // Get the name of an element for logging
    if (element.id) {
        return '#' + element.id;
    } else if (element.className) {
        return '.' + element.className.split(' ').join('.');
    } else if (element.tagName) {
        return element.tagName.toLowerCase();
    }
    return 'misc ad';
}

function matchesExclusion(el) {
    return el.matches('.html5-video-player') || // main video player
           el.matches('video') || // main video element
           el.matches('[class*="skip"] button') || // skip ad button
           el.matches('[class*="page-header-banner"]') ||
           el.matches("[class*='ad-persistent-progress']") || // used for determining if an ad is playing
           el.matches("[class*='ad-player-overlay']"); // used for determining if an ad is playing
}

// create a muted container inside of a document fragment inside of a shadow dom container
const shadowRoot = document.createElement('div').attachShadow({mode: 'open'});
const fragment = document.createDocumentFragment();
const mutedContainer = document.createElement('div');

mutedContainer.style.display = 'none'; // Hide visually
mutedContainer.style.pointerEvents = 'none'; // Prevent interaction
mutedContainer.setAttribute('muted', 'true'); // Mute audio

fragment.appendChild(mutedContainer);
shadowRoot.appendChild(fragment);

function removeAds() {
    if (lastInvocation !== 0) {
        return;
    }
    const thisInvocation = Date.now()
    lastInvocation = thisInvocation;

    const topLevelElements = new Set(document.querySelectorAll(adSelectorString));
    const elementsToRemove = Array.from(topLevelElements);
    const numEl = elementsToRemove.length;
    // reduce to parent-most elements
    elementsToRemove.forEach(el => {
        if (topLevelElements.has(el)) {
            elementsToRemove.forEach(child => {
                if (el !== child && el.contains(child)) {
                    topLevelElements.delete(child);
                }
            });
        }
    });
    // move to muted container
    topLevelElements.forEach(el => {
        if (!matchesExclusion(el)) {
            log(`Removing ${getElementSelector(el)}`);
            mutedContainer.appendChild(el);
//             if (isElementVisible(el)) {
//                 log(`Removing ${getElementSelector(el)}`);
//                 //el.remove();
//             } else {
//                 //el.style.opacity = '0'; // maybe unnecessary
//             }
        }
    });
    lastInvocation = 0;
}

function checkAds() {
    if (domChanges) {
        domChanges = false;
        removeAds();
    }
}

function waitForAdsAndObserve() {
    //if enough changes happen, then search and kill ads at the next interval
    checkAds();
    if (!intervalID2) {
        intervalID2 = setInterval(checkAds, checkInterval);
    }
    let observationCounter = 0;
    adObserver = new MutationObserver(function(mutations) {
        if (!domChanges) {
            //check if any nodes are added
            for (let mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    domChanges = true;
                    observationCounter = 0;
                    break;
                }
            }
            //check every observationThresh body changes
            observationCounter ++;
            if (observationCounter >= observationThresh) {
                domChanges = true;
                observationCounter = 0;
            }
        }
    });

    adObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function changeLogoLink() {
    // When a special promotion is going on, clicking the top left youtube
    // icon will take you back to the default home screen, not the promotional page
    document.querySelectorAll("#logo a").forEach(function(el) {
        el.setAttribute('href', 'https://www.youtube.com');
        try {
            el.data.commandMetadata.webCommandMetadata.url = '/';
            el.data.browseEndpoint.params = '';
        } catch (error) {
            // pass
        }
    });
}

function manualVideo() {
    setVideo(document.querySelector('video'));
}
function fullCheck() {
    manualVideo();
    waitForPlayer(vidAdSkip);
}

function bodyFunction() {
    waitForPlayer(() => {
        listen('play', 'VIDEO', 0, onPlay);
    });
    waitForAdsAndObserve();
    document.addEventListener('keydown', seekEvent);
    document.addEventListener("click", (event) => {
        fullCheck();
    });
    changeLogoLink();
}

function waitForBody(callback) {
    // Wait for document.body to exist
    if (document.body) {
        callback();
    } else {
        setTimeout(() => waitForBody(callback), 50);
    }
}


function waitForPlayer(callback) {
    playerElem = document.querySelector('.html5-video-player');
    if (playerElem) {
        callback();
    } else {
        setTimeout(() => waitForPlayer(callback), 50);
    }
}

function setVideo(elem) {
    videoElement = elem;
}

function onPlay(elem) {
    setVideo(elem);
    //vidAdSkip();
    waitForPlayer(vidAdSkip);
}

function listen(eventStr, targetTag, debounceDuration, callback) {
    let debounceTimer;
    document.addEventListener(eventStr, function(event) {
        //log(`${eventStr} event triggered.`);
        if (event.target.tagName === targetTag) {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(() => {
                callback(event.target);
            }, debounceDuration);
        }
    }, true);
}

//waitForBody(bodyFunction);
bodyFunction();

