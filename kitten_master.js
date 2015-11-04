var km = function() {
    var timer = null;

    var mustReassignJobs = false;
    var mustFarm = false;
    var oldJobs = null;

    var tabStack = [];

    var module = {
        resReserve: 0.95,
        fastCraft: true,
        // TODO: determine real ratios instead of just 10x defaults
        craftRatio: {
            beam: 10, // Keep 10x as many beams as derived products
            slab: 10,
            concrate: 10, // Yes, this is misspelled in the game code
            plate: 10,
            steel: 10,
            alloy: 10,
            eludium: 10,
            gear: 10,
            parchment: 10,
            manuscript: 10,
            compedium: 10, // Yes, this is misspelled in the game code
            blueprint: 10,
            scaffold: 10,
            ship: 10,
            tanker: 10,
            megalith: 10,
            starchart: 10
        },
        buildCap: {}, // add building name and maximum count to cap autoBuild
        autoGather: true,
        autoFarm: true,
        autoObserve: true,
        autoHunt: true,
        autoCraft: true,
        autoTrade: false,
        fastPray: false,
        autoPray: true,
        autoBuild: true,
        autoScience: true,
        autoUpgrade: true,
        autoJob: false,
    };

    /**
     * Randomize array element order in-place.
     * Using Durstenfeld shuffle algorithm.
     */
    function shuffle(array) {
        for (var i = array.length - 1; i > 0; --i) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }

        return array;
    }

    /*
     * Keep a cached copy of the crafts array so we can randomize in place
     * prior to auto crafting. We do this so one craft, such as plates, doesn't
     * prevent the crafting of another, in this case steel, by consuming all of
     * the required resources on each tick.
     */
    module.crafts = shuffle(gamePage.workshop.crafts.slice(0));

    /*
     * Keep a cached copy of the buildings array so we can randomize in place
     * prior to auto building. We do this so one building doesn't consume all
     * resources before another building has a chance to be built.
     */
    module.buildings = shuffle(gamePage.bld.buildingsData.slice(0));

    function refreshTabs () {
        for (var i = 0; i < gamePage.tabs.length; ++i) {
            gamePage.tabs[i].render();
        }
    }

    function getTab(tabId) {
        var tab = null;

        for (var i = 0; i < gamePage.tabs.length; ++i) {
            if (gamePage.tabs[i].tabId === tabId) {
                tab = gamePage.tabs[i];
                break;
            }
        }

        return tab;
    }

    function showTab(name) {
        gamePage.activeTabId = name;
        gamePage.render();
    }

    function pushTab(name) {
        tabStack.push(gamePage.activeTabId);
        showTab(name);
    }

    function popTab() {
        showTab(tabStack.pop());
    }

    function getButton(tab, name) {
        var button = null;

        if (tab.buttons.length === 0) {
            pushTab(tab.tabId);
            popTab();
        }

        for (var i = 0; i < tab.buttons.length; ++i) {
            if ((tab.buttons[i].name === name) ||
                (tab.buttons[i].buildingName === name) ||
                (tab.buttons[i].techName === name)) {
                button = tab.buttons[i];
                break;
            }
        }

        return button;
    }

    function gather() {
        if (module.autoGather && (gamePage.gatherClicks < 2499)) {
            var res = gamePage.resPool.get('catnip');

            if (res.value < res.maxValue) {
                var tab = getTab('Bonfire');
                var button = getButton(tab, 'Gather catnip');
                button.onClick(button);
            }
        }
    }

    function observe() {
        if (module.autoObserve && $('#observeBtn').length) {
            $('#observeBtn').click();
        }
    }

    function hunt() {
        if (module.autoHunt && gamePage.science.get('archery').researched) {
            if (gamePage.villageTab.visible) {
                var button = gamePage.villageTab.huntBtn;

                if (!button) {
                    pushTab(gamePage.villageTab.tabId);
                    button = gamePage.villageTab.huntBtn;
                    popTab();
                }

                if (button) {
                    for (var i = 0; i < button.prices.length; ++i) {
                        var res = gamePage.resPool.get(button.prices[i].name);

                        if ((res.value < button.prices[i].val) ||
                            (res.value < (res.maxValue * module.resReserve))) {
                            return;
                        }
                    }

                    if (button.enabled) {
                        button.onClick(button);
                    } else {
                        // Must be in Iron Will mode, so just hunt all.
                        gamePage.village.huntAll();
                    }
                }
            } else {
                // Must be in Iron Will mode, so just hunt all.
                gamePage.village.huntAll();
            }
        }
    }

    function craftItem(craft) {
        if (module.autoCraft) {
            /*
             * Beam, slab, and plate are unlocked by default, but technically
             * not craftable until you have a workshop.
             */
            if (craft.name === 'wood' ||
                (gamePage.workshopTab.visible && craft.unlocked)) {
                // The resource pool for the item we want to craft
                var item = gamePage.resPool.get(craft.name);

                var max_craft = 1;

                /*
                 * If fastCraft is true, this will determine the maximum amount
                 * which can be crafted.
                 */
                if (module.fastCraft) {
                    max_craft = Number.MAX_VALUE;

                    for (var i = 0; i < craft.prices.length; ++i) {
                        var res = gamePage.resPool.get(craft.prices[i].name);
                        var cost = craft.prices[i].val;

                        /*
                         * The ratio of items to components. Prevents
                         * components, such as parchment, from being starved
                         * out of other uses, such as amphitheaters.
                         */
                        var ratio = module.craftRatio[res.name];

                        // How many can I craft...
                        // ...from just this resource?
                        var rmax = Math.floor(res.value / cost);
                        max_craft = Math.min(max_craft, rmax);

                        // ...while maintaining the resource reserve?
                        if (res.maxValue) {
                            var can_use = res.value -
                                (res.maxValue * module.resReserve);
                            var vmax = Math.floor(can_use / cost);

                            // Craft at least 1 when over reserve
                            if (res.value > (res.maxValue * km.resReserve)) {
                                vmax = Math.max(1, vmax);
                            }

                            max_craft = Math.min(max_craft, vmax);
                        }

                        // ...while maintaining the craft ratio?
                        if (ratio) {
                            var tmax =
                                Math.floor((res.value - (item.value * ratio)) /
                                           ratio);
                            max_craft = Math.min(max_craft, tmax);
                        }
                    }
                }

                if (max_craft > 0) {
                    gamePage.craft(craft.name, max_craft);
                }
            }
        }
    }

    function craft() {
        if (module.autoCraft) {
            shuffle(module.crafts);

            for (var i = 0; i < module.crafts.length; ++i) {
                craftItem(module.crafts[i]);
            }
        }
    }

    function canTrade(raceName) {
        var result = false;

        var manpower = gamePage.resPool.get('manpower');
        var gold = gamePage.resPool.get('gold');
        var race = gamePage.diplomacy.get(raceName);

        if (module.autoTrade && gamePage.diplomacyTab.visible &&
            race.unlocked &&
            (manpower.value >= 50) &&
            (manpower.value >= (manpower.maxValue * module.resReserve)) &&
            (gold.value >= 15) &&
            (gold.value >= (gold.maxValue * module.resReserve))) {

            // We're good as long as we have enough resources to sell
            result = true;

            for (var i = 0; i < race.buys.length; ++i) {
                var res = gamePage.resPool.get(race.buys[i].name);

                if (res.value < race.buys[i].val) {
                    result = false;
                    break;
                }
            }
        }

        return result;
    }

    function tradeWith(raceName) {
        if (canTrade(raceName)) {
            var race = gamePage.diplomacy.get(raceName);

            var origTab = gamePage.activeTabId;

            if (gamePage.diplomacyTab.racePanels.length === 0) {
                showTab(gamePage.diplomacyTab.tabId);
            }

            for (var j = 0; j < gamePage.diplomacyTab.racePanels.length; ++j) {
                if (gamePage.diplomacyTab.racePanels[j].name == race.title) {
                    if (!gamePage.diplomacyTab.racePanels[j].tradeBtn.enabled) {
                        showTab(gamePage.diplomacyTab.tabId);
                    }

                    var button = gamePage.diplomacyTab.racePanels[j].tradeBtn;
                    button.onClick(button);

                    break;
                }
            }

            if (gamePage.activeTabId != origTab) {
                showTab(origTab);
            }
        }
    }

    function trade() {
        if (module.autoTrade && gamePage.diplomacyTab.visible) {
            // TODO: Try others besides Zebras
            tradeWith('zebras');
        }
    }

    // Returns true if the item was built
    function buildItem(name) {
        if (module.autoBuild) {
            var building = gamePage.bld.getBuilding(name);

            if (building.unlocked) {
                // Skip if we've hit the configured max, if any
                if (!module.buildCap[name] ||
                    (building.val < module.buildCap[name])) {
                    var prices = gamePage.bld.getPrices(name);

                    for (var i = 0; i < prices.length; ++i) {
                        var res = gamePage.resPool.get(prices[i].name);

                        if (res.value < prices[i].val) {
                            return false;
                        }
                    }

                    // Now get the button so we can click it
                    console.log('Building: ' + name);
                    refreshTabs();
                    var tab = getTab('Bonfire');
                    pushTab(tab.tabId);
                    var button = getButton(tab, name);
                    button.onClick(button);
                    popTab();
                    mustReassignJobs = true;
                    return true;
                }
            }
        }

        return false;
    }

    function buildField() {
        var field = gamePage.bld.getBuilding('field');
        var hut = gamePage.bld.getBuilding('hut');

        // For early game, don't be too greedy. we want a hut soon
        if (hut.val || (field.val < 30)) {
            return buildItem('field');
        }
    }

    // Try not to overpopulate
    function buildHut() {
        var field = gamePage.bld.getBuilding('field');
        var hut = gamePage.bld.getBuilding('hut');

        if (gamePage.science.get('agriculture').researched) {
            // TODO: some sort of logic...
            return buildItem('hut');
        } else {
            // Only build 1 to help prevent winter deaths
            if (hut.val === 0) {
                return buildItem('hut');
            }
        }
    }

    function build() {
        if (module.autoBuild) {
            // DUMB IMPLEMENTATION; GREEDY
            shuffle(module.buildings);

            for (var i = 0; i < module.buildings.length; ++i) {
                var building = module.buildings[i];

                // Only build one building per run
                if (building.name === 'field') {
                    if (buildField()) {
                        break;
                    }
                } else if (buildItem(building.name)) {
                    break;
                }
            }
        }
    }

    function assignJobs() {
        if (module.autoJob) {
            if (!gamePage.village.jobs) {
                pushTab(gamePage.villageTab.tabId);
                popTab();
            }

            if (mustFarm) {
                // If we are in emergency farm mode, all new kittens must farm
                var job = gamePage.village.getJob('farmer');
                while (gamePage.village.getFreeKittens() > 0) {
                    gamePage.village.assignJob(job);
                }
            } else {
                // Have we we've purchased buildings, science, or upgrades?
                if (mustReassignJobs) {
                    console.log('Reassigning jobs');
                    gamePage.village.clearJobs();
                    mustReassignJobs = false;
                }

                // Assign a job to all free kittens
                while (gamePage.village.getFreeKittens() > 0) {
                    // Make sure we have the latest data
                    gamePage.updateResources();

                    // DUMB IMPLEMENTATION; EQUALIZE RESOURCE RATES
                    var nextRate = 0;
                    var nextJob = null;

                    for (var i = 0; i < gamePage.village.jobs.length; ++i) {
                        var job = gamePage.village.jobs[i];

                        // only farm when absolutely necessary
                        if (job.unlocked && (job.name !== 'farmer')) {
                            // Make sure all available jobs have at least 1 worker
                            if (job.value === 0) {
                                nextJob = job;
                                break;
                            } else if (nextJob === null) {
                                nextJob = job;
                                for (var p in job.modifiers) {
                                    var res = gamePage.resPool.get(p);
                                    nextRate = res.perTickUI;
                                    // Only care about the first resource
                                    break;
                                }
                            } else {
                                for (var p in job.modifiers) {
                                    var res = gamePage.resPool.get(p);
                                    if (res.perTickUI < nextRate) {
                                        nextJob = job;
                                        nextRate = res.perTickUI;
                                    }
                                    // Only care about the first resource
                                    break;
                                }
                            }
                        }
                    }

                    if (nextJob) {
                        gamePage.village.assignJob(nextJob);
                    }
                }
            }
        }
    }

    // Protect against starvation; keep catnip over 5%
    function farm() {
        if (module.autoFarm &&
            gamePage.science.get('agriculture').researched) {
            var res = gamePage.resPool.get('catnip');

            if (!mustFarm && (res.value <= (res.maxValue * 0.05))) {
                mustFarm = true;

                // save old work assignments
                oldJobs = [];

                for (var i = 0; i < gamePage.village.jobs.length; ++i) {
                    oldJobs.push(gamePage.village.jobs[i].value);
                }

                // make everyone farmers
                gamePage.village.clearJobs();
                var job = gamePage.village.getJob('farmer');
                var free = gamePage.village.getFreeKittens();
                for (var j = 0; j < free; ++j) {
                    gamePage.village.assignJob(job);
                }
            } else if (mustFarm && (res.value >= (res.maxValue * 0.06))) {
                mustFarm = false;

                // restore old work assignments
                gamePage.village.clearJobs();

                for (var i = 0; i < gamePage.village.jobs.length; ++i) {
                    if (oldJobs[i] > 0) {
                        for (var j = 0; j < oldJobs[i]; ++j) {
                            gamePage.village.assignJob(gamePage.village.jobs[i]);
                        }
                    }
                }

                oldJobs = null;
            }
        }
    }

    function pray() {
        if (module.autoPray) {
            if (module.fastPray) {
                gamePage.religion.praise();
            } else {
                var res = gamePage.resPool.get('faith');

                if (res.value >= (res.maxValue * module.resReserve)) {
                    gamePage.religion.praise();
                }
            }
        }
    }

    function getTech(name) {
        var result = null;

        for (var i = 0; i < gamePage.science.techs.length; ++i) {
            if (gamePage.science.techs[i].name === name) {
                result = gamePage.science.techs[i];
                break;
            }
        }

        return result;
    }

    // A bit hacky because the game ties prices to the button
    function canResearch(button) {
        var result = false;

        var tech = getTech(button.techName);

        if (tech.unlocked && !tech.researched) {
            result = true;

            for (var i = 0; i < button.prices.length; ++i) {
                var res = gamePage.resPool.get(button.prices[i].name);

                if (res.value < button.prices[i].val) {
                    result = false;
                    break;
                }
            }
        }

        return result;
    }

    function science() {
        if (module.autoScience) {
            var tab = getTab('Science');

            if (tab.buttons.length === 0) {
                pushTab(tab.tabId);
                popTab();
            }

            // DUMB IMPLEMENTATION; GREEDY
            for (var i = 0; i < tab.buttons.length; ++i) {
                var button = tab.buttons[i];

                if (canResearch(button)) {
                    console.log('Researching: ' + button.name);
                    refreshTabs();
                    pushTab(tab.tabId);
                    button.onClick();
                    popTab();
                    mustReassignJobs = true;
                    // Only research one tech per run
                    break;
                }
            }
        }
    }

    function canUpgrade(upgrade) {
        var result = false;

        if (upgrade.unlocked && !upgrade.researched) {
            result = true;

            for (var i = 0; i < upgrade.prices.length; ++i) {
                var res = gamePage.resPool.get(upgrade.prices[i].name);

                if (res.value < upgrade.prices[i].val) {
                    result = false;
                    break;
                }
            }
        }

        return result;
    }

    function clickUpgradeButton(upgrade) {
        refreshTabs();
        var tab = gamePage.workshopTab;
        pushTab(tab.tabId);

        for (var i = 0; i < tab.buttons.length; ++i) {
            var button = tab.buttons[i];

            if (button.upgradeName == upgrade.name) {
                console.log('Upgrading: ' + upgrade.name);
                button.onClick();
                mustReassignJobs = true;
                break;
            }
        }

        popTab();
    }

    function upgrade() {
        if (module.autoUpgrade && gamePage.workshopTab.visible) {

            // DUMB IMPLEMENTATION; GREEDY
            for (var i = 0; i < gamePage.workshop.upgrades.length; ++i) {
                var upgrade = gamePage.workshop.upgrades[i];

                if (canUpgrade(upgrade)) {
                    clickUpgradeButton(upgrade);
                    // Only one upgrade per run
                    break;
                }
            }
        }
    }

    function getRawPrices(prices) {
        var result = {};

        if (prices && prices.length) {
            for (var i = 0; i < prices.length; ++i) {
                var res = gamePage.resPool.get(prices[i].name);

                // Because wood is craftable, but we don't care about catnip
                if (res.craftable && res.name !== 'wood') {
                    var craft = gamePage.workshop.getCraft(res.name);
                    var raw = getRawPrices(gamePage.workshop.getCraftPrice(craft));
                    for (var name in raw) {
                        result[name] = (result[name] || 0) +
                            (raw[name] * prices[i].val);
                    }
                } else {
                    result[res.name] = (result[res.name] || 0) + prices[i].val;
                }
            }
        }

        return result;
    }

    // Assumes prices given as result object from getRawPrices()
    function getRawTimes(prices) {
        var result = {};

        if (prices) {
            for (var name in prices) {
                var res = gamePage.resPool.get(name);

                if (res.perTickUI) {
                    result[name] = (prices[name] - res.value) /
                        (res.perTickUI * gamePage.rate);
                } else {
                    result[name] = NaN;
                }
            }
        }

        return result;
    }

    module.auto = function auto(on) {
        if (!on) {
            clearInterval(timer);
        } else if (!timer) {
            timer = setInterval(function() {
                observe();
                gather();
                science();
                upgrade();
                trade();
                hunt();
                craft();
                build();
                pray();
                assignJobs();
                farm();
            }, 100);
        }
    };

    module.start = function() {
        console.log('Kitten Master is playing.');
        module.auto(true);
    };

    module.stop = function() {
        console.log('Kitten Master is sleeping.');
        module.auto(false);
    };

    return module;
}();

// Automatically start the Kitten Master
km.start();
