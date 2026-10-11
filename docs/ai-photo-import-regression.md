# AI-foto-import: regressiecontrole (referentievoorbeeld)

Dit document is een **testfixture, geen regel in de detectiecode**. De pixelherkenning moet ook voor andere hockeydiagrammen en formaten werken.

## Referentieafbeelding
De door de tester aangeleverde originele oefening is 1536 × 1253 pixels (geen screenshot van de app), met een half veld en een goal bovenin. De upload bevat:
- 11 shirts: 1 grijze trainer (T), 4 zwarte spelers, 4 oranje spelers, 2 blauwe steunspelers
- **8 rode pylonnen**; oranje shirts zijn GEEN pylonnen
- 3 zwarte pijlen
- 2 labels 'Steunspeler'

## Ankers uit de daadwerkelijke kleurcomponenten
Coördinaten zijn genormaliseerd naar de volledige **bronfoto** en afgerond op drie decimalen, (x, y). De foto en canvasdelen gebruiken dezelfde veld-crop/transformatie.

Rode pylonnen, gemeten uit verbonden rode pixels (van linksboven naar rechtsonder):
```json
[[0.194,0.531],[0.793,0.530],[0.195,0.697],[0.794,0.690],[0.192,0.842],[0.795,0.842],[0.191,0.978],[0.795,0.974]]
```
Oranje spelers (mag **niet** als pylon tellen):
```json
[[0.594,0.605],[0.321,0.664],[0.600,0.804],[0.348,0.813]]
```
Overige spelers:
```json
{"blue":[[0.081,0.704],[0.908,0.877]],"black":[[0.327,0.569],[0.677,0.663],[0.525,0.738],[0.372,0.902]],"grey":[[0.069,0.565]]}
```

## Regressiechecks
1. Verifieer eerst de **bronpixels**: 8 rood-pylonnen, 4 oranje shirts en in totaal 11 shirts. Laat de pijldetectie het aantal 3 onafhankelijk bepalen.
2. De oorspronkelijke afbeelding is leidend voor de positie, niet een logische hockeyformatie.
3. Koppeling van kleuren, labels en nummers mag nooit een gemeten shirt verplaatsen of pylonnen aanvullen.
4. Vergelijk met de originele foto via de overlay; controleren dat álle 8 rode pylonnen en 11 shirts correct uitgelijnd zijn.
5. Upload minstens één andere oefening; **nooit aantallen of coördinaten uit deze fixture in het productie-algoritme opnemen**.

## Belangrijk
Een gelijk aantal herkende/geplaatste objecten bewijst geen ruimtelijke overeenkomst. Pylonnen en shirts moeten afzonderlijk worden geverifieerd. Bij onbetrouwbare detectie blijft handmatige correctie nodig.
