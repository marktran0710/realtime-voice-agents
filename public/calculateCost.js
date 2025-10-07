const COST_PER_AUDIO_INPUT_TOKEN = 0.000032;
const COST_PER_TEXT_INPUT_TOKEN = 0.000004;

const COST_PER_AUDIO_OUTPUT_TOKEN = 0.000064;
const COST_PER_TEXT_OUTPUT_TOKEN = 0.000004;

const COST_PER_CACHED_AUDIO_TOKEN = 0.0000004;
const COST_PER_CACHED_TEXT_TOKEN = 0.0000004;

const COST_PER_TOKEN = {
  audio_input: COST_PER_AUDIO_INPUT_TOKEN,
  text_input: COST_PER_TEXT_INPUT_TOKEN,

  audio_output: COST_PER_AUDIO_OUTPUT_TOKEN,
  text_output: COST_PER_TEXT_OUTPUT_TOKEN,

  cached_audio: COST_PER_CACHED_AUDIO_TOKEN,
  cached_text: COST_PER_CACHED_TEXT_TOKEN,
};

const accumulatedTurns = [];

function calculateCost(tokens, tokenType = "text_input") {
  return tokens * COST_PER_TOKEN[tokenType];
}

function addTurnData(turnData) {
  accumulatedTurns.push(turnData);
  renderTokenTable();
}

function renderTokenTable() {
  const tbody = document.querySelector("#token-usage-table tbody");
  tbody.innerHTML = ""; // Clear current content

  let grandTotal = 0;

  accumulatedTurns.forEach((data, index) => {
    const turnNumber = index + 1;
    let totalInputCostPerTurn = 0;
    let totalOutputCostPerTurn = 0;

    // Input row
    const inputRow = document.createElement("tr");
    const turnCell = document.createElement("td");
    turnCell.rowSpan = 2;
    turnCell.textContent = turnNumber;
    inputRow.appendChild(turnCell);

    inputRow.appendChild(
      Object.assign(document.createElement("td"), { textContent: "Input" })
    );
    inputRow.appendChild(
      Object.assign(document.createElement("td"), {
        textContent: data.input_tokens,
      })
    );
    inputRow.appendChild(
      Object.assign(document.createElement("td"), {
        textContent: data.input_token_details.text_tokens,
      })
    );
    inputRow.appendChild(
      Object.assign(document.createElement("td"), {
        textContent: data.input_token_details.audio_tokens,
      })
    );
    inputRow.appendChild(
      Object.assign(document.createElement("td"), {
        textContent: data.input_token_details.cached_tokens_details.text_tokens,
      })
    );
    inputRow.appendChild(
      Object.assign(document.createElement("td"), {
        textContent:
          data.input_token_details.cached_tokens_details.audio_tokens,
      })
    );
    totalInputCostPerTurn =
      calculateCost(data.input_token_details.text_tokens, "text_input") +
      calculateCost(data.input_token_details.audio_tokens, "audio_input") +
      calculateCost(
        data.input_token_details.cached_tokens_details.text_tokens,
        "cached_text"
      ) +
      calculateCost(
        data.input_token_details.cached_tokens_details.audio_tokens,
        "cached_audio"
      );
    inputRow.appendChild(
      Object.assign(document.createElement("td"), {
        textContent: "$" + totalInputCostPerTurn.toFixed(7),
      })
    );

    tbody.appendChild(inputRow);

    // Output row
    const outputRow = document.createElement("tr");
    outputRow.appendChild(
      Object.assign(document.createElement("td"), { textContent: "Output" })
    );
    outputRow.appendChild(
      Object.assign(document.createElement("td"), {
        textContent: data.output_tokens,
      })
    );
    outputRow.appendChild(
      Object.assign(document.createElement("td"), {
        textContent: data.output_token_details.text_tokens,
      })
    );
    outputRow.appendChild(
      Object.assign(document.createElement("td"), {
        textContent: data.output_token_details.audio_tokens,
      })
    );
    outputRow.appendChild(
      Object.assign(document.createElement("td"), { textContent: 0 })
    ); // output cached text tokens, output does not use cached tokens
    outputRow.appendChild(
      Object.assign(document.createElement("td"), { textContent: 0 })
    ); // output cached audio tokens, output does not use cached tokens

    totalOutputCostPerTurn =
      calculateCost(data.output_token_details.text_tokens, "text_output") +
      calculateCost(data.output_token_details.audio_tokens, "audio_output");
    outputRow.appendChild(
      Object.assign(document.createElement("td"), {
        textContent: "$" + totalOutputCostPerTurn.toFixed(7),
      })
    );

    tbody.appendChild(outputRow);

    grandTotal += totalInputCostPerTurn + totalOutputCostPerTurn;
  });

  // Total row
  const totalRow = document.createElement("tr");
  const totalLabelCell = document.createElement("td");
  totalLabelCell.colSpan = 7;
  totalLabelCell.style.textAlign = "right";
  totalLabelCell.style.fontWeight = "bold";
  totalLabelCell.textContent = "Total Cost";

  const totalCostCell = document.createElement("td");
  totalCostCell.style.fontWeight = "bold";
  totalCostCell.textContent = "$" + grandTotal.toFixed(7);

  totalRow.appendChild(totalLabelCell);
  totalRow.appendChild(totalCostCell);
  tbody.appendChild(totalRow);
}

function resetTokenData() {
  accumulatedTurns.length = 0;
  renderTokenTable();
}
