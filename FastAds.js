// ==UserScript==
// @name         Fast Ads
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Gotta go fast!
// @author       wmol4
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-body
// ==/UserScript==

let maxRateFound = null;
let playerElem = null;
let videoElem = null;
let intervalID = null;
let isHidden = false;
let opacityVal = '0.25';
let intervals = {};
let overlayElem = null;

let playerChangesObserver = null;
let playerObserver = null;
let adChangesObservers = new Set();
let adObserver = null;

function trySkipAd() {
    let skipButton = document.querySelector('.ytp-ad-skip-button');
    if (skipButton && !skipButton.disabled) {
        skipButton.click();
        console.log('[Fast Ads] HUGE skip');
    }
}

function createOverlay() {
    overlayElem = document.createElement('div');
    overlayElem.style.position = 'absolute';
    overlayElem.style.display = 'flex';
    overlayElem.style.justifyContent = 'center'; // Horizontally center the inner div
    overlayElem.style.alignItems = 'center'; // Vertically center the inner div
    overlayElem.style.pointerEvents = 'none'; // Allow click events to pass through the overlay

    // Create an inner div for the text
    let textDiv = document.createElement('div');
    textDiv.innerText = "SKIPPING ADS";
    textDiv.style.fontSize = `${playerElem.offsetHeight * 0.25}px`;
    textDiv.style.lineHeight = `${playerElem.offsetHeight * 0.25}px`;
    textDiv.style.overflow = 'hidden';
    textDiv.style.color = 'grey';
    //textDiv.style.backgroundColor = 'black';
    //textDiv.style.padding = '10px';
    //textDiv.style.borderRadius = '5px';

    // Add the textDiv to the overlayElem
    overlayElem.appendChild(textDiv);

    // Get the position and size of the playerElem
    let rect = playerElem.getBoundingClientRect();
    overlayElem.style.top = `${rect.top + window.scrollY}px`;
    overlayElem.style.left = `${rect.left + window.scrollX}px`;
    overlayElem.style.width = `${rect.width}px`;
    overlayElem.style.height = `${rect.height}px`;

    // Get the z-index of the playerElem and set the overlay's z-index to one higher
    let zIndex = window.getComputedStyle(playerElem).zIndex;
    overlayElem.style.zIndex = (parseInt(zIndex, 10) || 0) + 1;
    overlayElem.style.display = 'none';
    // Add the overlay to the document body
    document.body.appendChild(overlayElem);
}

function hideElements() {
    if (isHidden === false || playerElem.style.opacity === '1') {
        playerElem.style.opacity = opacityVal;
        videoElem.style.opacity = opacityVal;
        overlayElem.style.display = 'flex';
        console.log('[Fast Ads] Get blocked, kid');
        isHidden = true;
    }
}

function showElements() {
    if (isHidden === true || playerElem.style.opacity !== '1') {
        playerElem.style.opacity = '1';
        videoElem.style.opacity = '1';
        overlayElem.style.display = 'none';
        //console.log('[Fast Ads] Get unblocked, champ');
        isHidden = false;
    }
}

function closeInterval() {
    if (intervalID) {
        clearInterval(intervalID); // Stop clicking the skip ad button
        intervalID = null;
    }
}

function getMaxRate() {
    let rate = 16;
    const decrement = 1;
    while (rate > 1) { // Ensure rate doesn't go below 1
        try {
            videoElem.playbackRate = rate;
            maxRateFound = rate;
            //console.log('[Fast Ads] Max Speed: ' + maxRateFound);
            break;
        } catch (error) {
            // Error when setting unsupported playback rate, just continue with the loop
        }
        rate -= decrement;
    }
    if (maxRateFound === null) {
        maxRateFound = 1;
    }
}

function speedUpAds() {
    if (playerElem.classList.contains('ad-interrupting')) {
        if (maxRateFound === null) { // first call to set isInterrupting and maxRateFound
            getMaxRate();
        }
        if (intervalID === null) {
            // Start clicking the skip ad button every 100ms, set the ID to close later
            intervalID = setInterval(trySkipAd, 100);
        }
        hideElements();
        videoElem.playbackRate = maxRateFound;
        videoElem.muted = true;
        //playerElem.mute();
    } else {
        closeInterval();
        showElements();
        videoElem.playbackRate = 1;
        videoElem.muted = false; // Unmute the video
        //playerElem.unMute();
    }
}

function waitForBodyAndObserve(callback) {
    if (document.body) {
        callback();
    } else {
        setTimeout(() => waitForBodyAndObserve(callback), 10);
    }
}

function observePlayerChanges() {
    createOverlay();
    speedUpAds();
    playerChangesObserver = new MutationObserver(function(mutationsList, obs) {
        speedUpAds();
    });

    // Start observing
    playerChangesObserver.observe(playerElem, {
        attributes: true,
        attributeFilter: ['class'] // Only look for changes in the class attribute
    });
}

function waitForPlayerAndObserve() {
    playerElem = document.querySelector('.html5-video-player');
    videoElem = document.querySelector('video');
    if (playerElem && videoElem) {
        observePlayerChanges();
    } else {
        playerObserver = new MutationObserver(function(mutations) {
            playerElem = playerElem || document.querySelector('.html5-video-player');
            videoElem = videoElem || document.querySelector('video');
            if (playerElem && videoElem) {
                observePlayerChanges();
                playerObserver.disconnect();
            }
        });
        playerObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

function observeAdChanges(adElem, selector) {
    if (!adElem) return;

    adElem.remove();

    const observer = new MutationObserver(function(mutationsList, obs) {
        if (!document.body.contains(adElem)) {
            obs.disconnect();
            adChangesObservers.delete(obs)
        } else {
            adElem.remove();
            obs.disconnect();
            adChangesObservers.delete(obs)
        }
    });

    adChangesObservers.add(observer)
    observer.observe(adElem, {
        attributes: true,
        childList: true,
        subtree: true
    });

    console.log('[Fast Ads] Removed ' + selector);
}

const adSelectors = ['#fulfilled-layout', '#player-ads', '#masthead-ad']; // Add all your ad selectors here
// const adSelectors = ['#fulfilled-layout', '#player-ads', '#masthead-ad', '#rendering-content > ytd-video-display-full-buttoned-renderer', '[target-id="engagement-panel-ads"]', '#panels', '#contents > ytd-ad-slot-renderer']
function waitForAdsAndObserve() {
    const observedSelectors = new Set();

    adObserver = new MutationObserver(function(mutations) {
        adSelectors.forEach(selector => {
            let adElem = document.querySelector(selector);
            if (adElem && !observedSelectors.has(selector)) {
                observeAdChanges(adElem, selector);
                observedSelectors.add(selector); // Mark the selector as observed
            }
        });
    });

    // Initial check and removal
    adSelectors.forEach(selector => {
        let adElem = document.querySelector(selector);
        if (adElem) {
            observeAdChanges(adElem, selector);
            observedSelectors.add(selector);
        }
    });

    adObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function mainFunction() {
    'use strict';

    if (overlayElem) {
        overlayElem.remove();
        //console.log('[Fast Ads] Removed overlay');
    }
    if (playerChangesObserver) {
        playerChangesObserver.disconnect();
        playerChangesObserver = null;
        //console.log('[Fast Ads] Reset playerChangesObserver');
    }
    if (playerObserver) {
        playerObserver.disconnect();
        playerObserver = null;
        //console.log('[Fast Ads] Reset playerObserver');
    }
    if (adChangesObservers.size > 0) {
        adChangesObservers.forEach(obs => obs.disconnect());
        adChangesObservers.clear();
        //console.log(`[Fast Ads] Disconnecting and clearing ${adChangesObservers.size} adChangesObservers`);
    }
    if (adObserver) {
        adObserver.disconnect();
        adObserver = null;
        //console.log('[Fast Ads] Reset adObserver');
    }

    waitForBodyAndObserve(waitForPlayerAndObserve);
    waitForBodyAndObserve(waitForAdsAndObserve);
}

let lastPathStr = location.pathname;
let lastQueryStr = location.search;
let lastHashStr = location.hash;

// Polling logic to detect URL changes
function checkForURLChange() {
    if (lastPathStr !== location.pathname || lastQueryStr !== location.search || lastHashStr !== location.hash) {
        lastPathStr = location.pathname;
        lastQueryStr = location.search;
        lastHashStr = location.hash;
        //console.log('[Fast Ads] URL change detected');
        mainFunction();
    }
}

// Run script logic immediately for initial page load
mainFunction();

// Set an interval to continuously check for URL changes
setInterval(checkForURLChange, 500);
